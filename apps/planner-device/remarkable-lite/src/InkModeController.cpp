#include "InkModeController.h"
#include "PaperOsPaths.h"
#include "PerfLog.h"
#include "epframebuffer.h"
#include "ink-gold/EvdevMarkerSource.h"
#include "ink-gold/DisplayScheduler.h"
#include "ink-gold/PenPipeline.h"

#include <QDir>
#include <QFile>
#include <QFont>
#include <QGuiApplication>
#include <QImage>
#include <QJsonDocument>
#include <QPainter>
#include <QRect>
#include <QScreen>
#include <QTimer>
#include <QDebug>
#include <iterator>

// The ink-gold pipeline's shared raster target; in the shell this is bound
// to the resolved vendor framebuffer only while an ink session is active.
QImage *g_inkGoldBuffer = nullptr;

static const int kPortraitTitleH = 88;
static const int kPortraitRailW = 96;
static const int kLandscapeBarH = 96;

struct InkColorChoice {
    const char *name;
    uint32_t value;
};

static const InkColorChoice kColors[] = {
    {"black",  0xFF111111},
    {"red",    0xFFB53232},
    {"blue",   0xFF2D5F9A},
    {"yellow", 0xFFD19A20},
};

static double darkestRowRatio(const QImage &image, int y, int thickness)
{
    double best = 0.0;
    for (int row = y; row < qMin(image.height(), y + thickness); ++row) {
        int dark = 0;
        for (int x = 0; x < image.width(); ++x)
            dark += qGray(image.pixel(x, row)) < 64 ? 1 : 0;
        best = qMax(best, image.width() > 0 ? double(dark) / image.width() : 0.0);
    }
    return best;
}

static double darkestColumnRatio(const QImage &image, int x, int yStart, int thickness)
{
    double best = 0.0;
    for (int column = x; column < qMin(image.width(), x + thickness); ++column) {
        int dark = 0;
        const int height = image.height() - yStart;
        for (int y = yStart; y < image.height(); ++y)
            dark += qGray(image.pixel(column, y)) < 64 ? 1 : 0;
        best = qMax(best, height > 0 ? double(dark) / height : 0.0);
    }
    return best;
}

static bool hasLegacyBakedChrome(const QImage &image)
{
    if (image.isNull())
        return false;
    const bool landscape = image.width() > image.height();
    const int titleY = qRound(image.height()
        * double(landscape ? kLandscapeBarH : kPortraitTitleH)
        / double(landscape ? 954 : 1696));
    const bool horizontalRule = darkestRowRatio(image, titleY, 4) > 0.75;
    if (landscape)
        return horizontalRule;
    const int railX = qRound(image.width() * double(kPortraitRailW) / 954.0);
    return horizontalRule && darkestColumnRatio(image, railX, titleY, 4) > 0.75;
}

static QRect backZone(bool landscape)
{
    return landscape ? QRect(0, 0, 176, kLandscapeBarH)
                     : QRect(0, 0, 220, kPortraitTitleH);
}

static QRect toolZone(bool landscape, int index)
{
    if (landscape)
        return QRect(672 + index * 176, 8, 160, 80);
    return QRect(8, 112 + index * 92, 80, 80);
}

static QRect colorZone(bool landscape, int index)
{
    if (landscape)
        return QRect(1216 + index * 104, 8, 88, 80);
    return QRect(8, 424 + index * 92, 80, 80);
}

InkModeController::InkModeController(QObject *parent) : QObject(parent) {}

QString InkModeController::tool() const
{
    if (g_inkTool.eraser)
        return QStringLiteral("eraser");
    return g_inkTool.nib >= 8 ? QStringLiteral("marker") : QStringLiteral("pen");
}

QString InkModeController::color() const
{
    for (const auto &choice : kColors) {
        if (choice.value == g_inkTool.color)
            return QString::fromLatin1(choice.name);
    }
    return QStringLiteral("black");
}

QString InkModeController::chromeName() const
{
    return m_chrome == Chrome::Revealed ? QStringLiteral("revealed")
                                        : QStringLiteral("clean");
}

bool InkModeController::testBridgeEnabled() const
{
    return qEnvironmentVariableIntValue("PAPEROS_TEST_BRIDGE") == 1;
}

void InkModeController::enter(const QString &noteId)
{
    if (m_active || noteId.isEmpty())
        return;

    m_noteId = noteId;
    emit noteIdChanged();
    m_noteDir = paperosHome() + QStringLiteral("/data/notes/") + noteId;
    if (!QDir(m_noteDir).exists()) {
        qWarning() << "InkMode: note directory missing:" << m_noteDir;
        return;
    }

    m_noteTitle.clear();
    QFile metaFile(m_noteDir + QStringLiteral("/meta.json"));
    if (metaFile.open(QIODevice::ReadOnly))
        m_noteTitle = QJsonDocument::fromJson(metaFile.readAll()).object().value("title").toString();
    if (m_noteTitle.isEmpty())
        m_noteTitle = QStringLiteral("Notebook");

    if (QScreen *screen = QGuiApplication::primaryScreen()) {
        m_screenW = screen->geometry().width();
        m_screenH = screen->geometry().height();
    }
    m_landscape = m_screenW > m_screenH;

    PerfLog::instance().log("INK_MODE_ENTER", {{"noteId", noteId}});
    m_leaving = false;
    m_ready = false;
    m_chrome = Chrome::Clean;
    m_lastRetreat.clear();
    m_canvasDirty = false;
    ++m_retreatGeneration;
    emit chromeChanged();
    setActive(true);
    // Let the e-paper scenegraph finish the static full-screen cover before
    // direct framebuffer ownership begins. The backend can take well beyond
    // one LCD frame to settle; starting at 300 ms allowed a late cover swap
    // to overwrite the native canvas after entry.
    QTimer::singleShot(1500, this, [this]() { beginSession(); });
}

void InkModeController::beginSession()
{
    if (!m_active || m_leaving)
        return;

    // Same process, same display owner: reuse the shell's vendor
    // framebuffer. Candidates were captured at startup by the epfb.cpp
    // interposers (armCapture in main()).
    EPFramebuffer *ep = EPFramebuffer::instance();
    DirectInkDiag::resolveInto();
    if (!ep || !DirectInkDiag::ready()) {
        PerfLog::instance().log("INK_MODE_DISPLAY_FAILED", {
            {"candidates", DirectInkDiag::candidates().size()},
        });
        qWarning() << "InkMode: vendor framebuffer not resolved";
        leave(2);
        return;
    }
    g_inkGoldBuffer = g_drawBuffer;

    DisplayScheduler::instance().presenter = [ep](const QRect &r) {
        ep->sendSwap(r, EPContentType::Mono, EPScreenMode::QualityFastest,
                     EPFramebuffer::NoRefresh);
    };
    DisplayScheduler::instance().settlePresenter = [ep](const QRect &r) {
        ep->sendSwap(r.adjusted(-3, -3, 3, 3), EPContentType::Color,
                     EPScreenMode::Quality3, EPFramebuffer::NoRefresh);
    };

    drawPage();
    ep->sendSwap(QRect(0, 0, m_screenW, m_screenH), EPContentType::Color,
                 EPScreenMode::Quality3, EPFramebuffer::CompleteRefresh);
    PerfLog::instance().log("INK_MODE_PAGE_PAINTED");

    m_evdev = new EvdevMarkerSource(
        qEnvironmentVariable("PAPEROS_MARKER_DEVICE", "/dev/input/event2"),
        m_screenW, m_screenH, this);
    QString err;
    if (!m_evdev->start(&err)) {
        PerfLog::instance().log("INK_MODE_MARKER_FAILED", {{"reason", err}});
        qWarning() << "InkMode: marker init failed:" << err;
        leave(3);
        return;
    }
    QString detail;
    if (!m_evdev->validateMapping(&detail)) {
        PerfLog::instance().log("INK_MODE_MAPPING_FAILED", {{"detail", detail}});
        leave(4);
        return;
    }

    m_penWasDown = false;
    m_downInBackZone = false;
    m_downInHeader = false;
    m_downInHandle = false;
    m_evdev->frameFilter = [this](const PenFrame &f) -> bool {
        const QPoint point(f.mappedX, f.mappedY);
        if (f.touching && !m_penWasDown) {
            m_penWasDown = true;
            m_downInHandle = m_chrome == Chrome::Clean && handleRect().contains(point);
            m_downInBackZone = m_chrome == Chrome::Revealed
                && backZone(m_landscape).contains(point);
            m_downInHeader = m_chrome == Chrome::Revealed && inChromeZone(point);
        } else if (!f.touching && m_penWasDown) {
            m_penWasDown = false;
            if (m_downInHandle) {
                const bool activate = handleRect().contains(point);
                m_downInHandle = false;
                if (activate)
                    QTimer::singleShot(0, this, [this]() { revealChrome(); });
                return true;
            }
            if (m_downInBackZone && backZone(m_landscape).contains(point)) {
                PerfLog::instance().log("BACK_TAP");
                // Leave via the event loop — not from inside the evdev read.
                QTimer::singleShot(0, this, [this]() { leave(0); });
                return true;
            }
            if (m_downInHeader) {
                handleToolbarTap(point);
                m_downInHeader = false;
                m_downInBackZone = false;
                return true;
            }
            m_downInBackZone = false;
            m_canvasDirty = true;
            scheduleWritingRetreat();
        }
        if (m_downInHandle || m_downInHeader || m_downInBackZone)
            return true;
        return false;
    };

    m_evdev->setAcceptInput(true);
    m_ready = true;
    emit chromeChanged();
    PerfLog::instance().log("INK_MODE_LIVE");
}

void InkModeController::leave(int code)
{
    if (m_leaving)
        return;
    m_leaving = true;
    ++m_retreatGeneration;

    if (m_evdev) {
        m_evdev->setAcceptInput(false);
        if (code == 0)
            savePage();
        delete m_evdev;  // releases EVIOCGRAB
        m_evdev = nullptr;
    }
    DisplayScheduler::instance().presenter = nullptr;
    DisplayScheduler::instance().settlePresenter = nullptr;
    g_inkGoldBuffer = nullptr;
    m_ready = false;
    emit chromeChanged();

    PerfLog::instance().log("INK_MODE_EXIT", {{"exitCode", code}});
    setActive(false);  // QML overlay hides; scenegraph re-renders the shell
    emit exited(code);

    // After the scenegraph's own swap, clear retained ink-page pixels.
    const QRect screenRect(0, 0, m_screenW, m_screenH);
    QTimer::singleShot(450, this, [screenRect]() {
        if (EPFramebuffer *ep = EPFramebuffer::instance())
            ep->sendSwap(screenRect, EPContentType::Mono,
                         EPScreenMode::Quality3, EPFramebuffer::CompleteRefresh);
    });
}

void InkModeController::drawPage()
{
    QPainter p(g_inkGoldBuffer);
    p.fillRect(g_inkGoldBuffer->rect(), Qt::white);

    const QString pagePath = m_noteDir + QStringLiteral("/page-001.png");
    if (QFile::exists(pagePath)) {
        QImage prior(pagePath);
        if (!prior.isNull()) {
            if (hasLegacyBakedChrome(prior)) {
                const bool priorLandscape = prior.width() > prior.height();
                QPainter cleanup(&prior);
                if (priorLandscape) {
                    const int barH = qRound(prior.height() * double(kLandscapeBarH) / 954.0);
                    cleanup.fillRect(QRect(0, 0, prior.width(), barH + 3), Qt::white);
                } else {
                    const int titleH = qRound(prior.height() * double(kPortraitTitleH) / 1696.0);
                    const int railW = qRound(prior.width() * double(kPortraitRailW) / 954.0);
                    cleanup.fillRect(QRect(0, 0, prior.width(), titleH + 2), Qt::white);
                    cleanup.fillRect(QRect(0, titleH, railW + 2,
                                           prior.height() - titleH), Qt::white);
                }
                PerfLog::instance().log("NOTE_LEGACY_CHROME_REMOVED_IN_MEMORY");
            }
            p.drawImage(QRect(0, 0, m_screenW, m_screenH), prior);
            PerfLog::instance().log("NOTE_PAGE_RESTORED", {{"path", pagePath}});
        }
    }

    p.end();

    m_topUnder = QImage();
    m_railUnder = QImage();
    m_cleanCanvasFrame = g_inkGoldBuffer->copy();
    m_handleUnder = g_inkGoldBuffer->copy(handleRect());
    paintHandle(false);
    m_captureFrame = g_inkGoldBuffer->copy();
}

void InkModeController::drawToolbar()
{
    if (!g_inkGoldBuffer)
        return;
    QPainter p(g_inkGoldBuffer);
    const QRect controlsRect = m_landscape
        ? QRect(0, 0, m_screenW, kLandscapeBarH)
        : QRect(0, 0, kPortraitRailW, m_screenH);
    p.fillRect(controlsRect, Qt::white);
    if (!m_landscape)
        p.fillRect(QRect(0, 0, m_screenW, kPortraitTitleH), Qt::white);
    QFont f;
    f.setPixelSize(m_landscape ? 28 : 30);
    f.setBold(true);
    p.setFont(f);
    p.setPen(Qt::black);
    p.drawText(backZone(m_landscape).adjusted(22, 0, 0, 0), Qt::AlignLeft | Qt::AlignVCenter,
               QStringLiteral("< Back"));
    QFont f2;
    f2.setPixelSize(m_landscape ? 26 : 24);
    f2.setBold(true);
    p.setFont(f2);
    const QRect titleRect = m_landscape
        ? QRect(backZone(true).right() + 16, 0, 450, kLandscapeBarH)
        : QRect(backZone(false).right() + 16, 0,
                m_screenW - backZone(false).right() - 40, kPortraitTitleH);
    p.drawText(titleRect, m_landscape ? (Qt::AlignLeft | Qt::AlignVCenter)
                                     : (Qt::AlignRight | Qt::AlignVCenter),
               m_noteTitle);

    auto drawTool = [&p](const QRect &rect, const QString &label, bool selected) {
        p.setPen(QPen(Qt::black, selected ? 4 : 2));
        p.setBrush(selected ? Qt::black : Qt::white);
        p.drawRect(rect);
        QFont toolFont;
        toolFont.setPixelSize(rect.width() < 100 ? 20 : 23);
        toolFont.setBold(selected);
        p.setFont(toolFont);
        p.setPen(selected ? Qt::white : Qt::black);
        p.drawText(rect, Qt::AlignCenter, label);
    };
    const QString selectedTool = tool();
    drawTool(toolZone(m_landscape, 0), m_landscape ? QStringLiteral("Pen 1") : QStringLiteral("P1"),
             selectedTool == QLatin1String("pen"));
    drawTool(toolZone(m_landscape, 1), m_landscape ? QStringLiteral("Pen 2") : QStringLiteral("P2"),
             selectedTool == QLatin1String("marker"));
    drawTool(toolZone(m_landscape, 2), m_landscape ? QStringLiteral("Eraser") : QStringLiteral("Erase"),
             selectedTool == QLatin1String("eraser"));

    for (int i = 0; i < int(std::size(kColors)); ++i) {
        const auto &choice = kColors[i];
        const QPoint center = colorZone(m_landscape, i).center();
        p.setBrush(QColor::fromRgba(choice.value));
        p.setPen(QPen(Qt::black, g_inkTool.color == choice.value && !g_inkTool.eraser ? 5 : 1));
        p.drawEllipse(center, 26, 26);
    }
    if (m_landscape)
        p.fillRect(QRect(0, kLandscapeBarH, m_screenW, 3), Qt::black);
    else {
        p.fillRect(QRect(0, kPortraitTitleH, m_screenW, 2), Qt::black);
        p.fillRect(QRect(kPortraitRailW, kPortraitTitleH, 2,
                         m_screenH - kPortraitTitleH), Qt::black);
    }
}

bool InkModeController::handleToolbarTap(const QPoint &point)
{
    bool changed = true;
    if (toolZone(m_landscape, 0).contains(point)) {
        g_inkTool.nib = 4;
        g_inkTool.eraser = false;
    } else if (toolZone(m_landscape, 1).contains(point)) {
        g_inkTool.nib = 10;
        g_inkTool.eraser = false;
    } else if (toolZone(m_landscape, 2).contains(point)) {
        g_inkTool.eraser = true;
    } else {
        changed = false;
        for (int i = 0; i < int(std::size(kColors)); ++i) {
            const auto &choice = kColors[i];
            if (colorZone(m_landscape, i).contains(point)) {
                g_inkTool.color = choice.value;
                g_inkTool.eraser = false;
                changed = true;
                break;
            }
        }
    }
    if (!changed)
        return false;

    drawToolbar();
    m_captureFrame = g_inkGoldBuffer->copy();
    if (EPFramebuffer *ep = EPFramebuffer::instance()) {
        ep->sendSwap(topChromeRect(), EPContentType::Color, EPScreenMode::Quality3, EPFramebuffer::NoRefresh);
        if (!railChromeRect().isNull())
            ep->sendSwap(railChromeRect(), EPContentType::Color, EPScreenMode::Quality3, EPFramebuffer::NoRefresh);
    }
    PerfLog::instance().log("INK_TOOL_CHANGED", {{"tool", tool()}, {"color", color()}});
    emit toolChanged();
    return true;
}

QRect InkModeController::handleRect() const
{
    return QRect(12, 12, 88, 88).intersected(
        QRect(0, 0, m_screenW, m_screenH));
}

QRect InkModeController::topChromeRect() const
{
    return QRect(0, 0, m_screenW,
                 m_landscape ? kLandscapeBarH : kPortraitTitleH);
}

QRect InkModeController::railChromeRect() const
{
    return m_landscape
        ? QRect()
        : QRect(0, kPortraitTitleH, kPortraitRailW, m_screenH - kPortraitTitleH);
}

bool InkModeController::inChromeZone(const QPoint &point) const
{
    return topChromeRect().contains(point) || railChromeRect().contains(point);
}

void InkModeController::paintHandle(bool inverted)
{
    if (!g_inkGoldBuffer)
        return;
    const QRect rect = handleRect();
    QPainter p(g_inkGoldBuffer);
    p.fillRect(rect, inverted ? Qt::black : Qt::white);
    p.setPen(QPen(inverted ? Qt::white : Qt::black, 3));
    p.drawRect(rect.adjusted(1, 1, -2, -2));
    QFont font;
    font.setPixelSize(22);
    font.setBold(true);
    p.setFont(font);
    p.drawText(rect, Qt::AlignCenter, QStringLiteral("Tools"));
}

void InkModeController::eraseHandle()
{
    if (!g_inkGoldBuffer || m_handleUnder.isNull())
        return;
    QPainter p(g_inkGoldBuffer);
    p.drawImage(handleRect(), m_handleUnder);
    m_handleUnder = QImage();
}

void InkModeController::applyReveal()
{
    if (!m_active || !m_ready || !g_inkGoldBuffer || m_chrome == Chrome::Revealed)
        return;

    ++m_retreatGeneration;
    eraseHandle();
    m_topUnder = g_inkGoldBuffer->copy(topChromeRect());
    if (!railChromeRect().isNull())
        m_railUnder = g_inkGoldBuffer->copy(railChromeRect());
    drawToolbar();
    m_chrome = Chrome::Revealed;
    m_lastRetreat.clear();
    m_captureFrame = g_inkGoldBuffer->copy();

    if (EPFramebuffer *ep = EPFramebuffer::instance()) {
        ep->sendSwap(topChromeRect(), EPContentType::Mono,
                     EPScreenMode::Quality3, EPFramebuffer::NoRefresh);
        if (!railChromeRect().isNull())
            ep->sendSwap(railChromeRect(), EPContentType::Mono,
                         EPScreenMode::Quality3, EPFramebuffer::NoRefresh);
    }
    PerfLog::instance().log("INK_CHROME_REVEALED");
    emit chromeChanged();
}

void InkModeController::applyHide(const QString &reason, bool present)
{
    if (!m_active || !m_ready || !g_inkGoldBuffer || m_chrome != Chrome::Revealed)
        return;

    ++m_retreatGeneration;
    {
        QPainter p(g_inkGoldBuffer);
        if (!m_topUnder.isNull())
            p.drawImage(topChromeRect(), m_topUnder);
        if (!m_railUnder.isNull())
            p.drawImage(railChromeRect(), m_railUnder);
    }
    m_topUnder = QImage();
    m_railUnder = QImage();
    m_handleUnder = g_inkGoldBuffer->copy(handleRect());
    paintHandle(false);
    m_chrome = Chrome::Clean;
    m_lastRetreat = reason;
    m_captureFrame = g_inkGoldBuffer->copy();

    if (present) {
        if (EPFramebuffer *ep = EPFramebuffer::instance()) {
            ep->sendSwap(topChromeRect(), EPContentType::Mono,
                         EPScreenMode::Quality3, EPFramebuffer::NoRefresh);
            if (!railChromeRect().isNull())
                ep->sendSwap(railChromeRect(), EPContentType::Mono,
                             EPScreenMode::Quality3, EPFramebuffer::NoRefresh);
            else
                ep->sendSwap(handleRect(), EPContentType::Mono,
                             EPScreenMode::Quality3, EPFramebuffer::NoRefresh);
        }
    }
    PerfLog::instance().log("INK_CHROME_HIDDEN", {{"reason", reason}});
    emit chromeChanged();
}

void InkModeController::scheduleWritingRetreat()
{
    if (!m_active || !m_ready || m_chrome != Chrome::Revealed)
        return;
    const quint64 generation = ++m_retreatGeneration;
    QTimer::singleShot(1500, this, [this, generation]() {
        if (generation == m_retreatGeneration && m_active && m_ready
            && m_chrome == Chrome::Revealed) {
            applyHide(QStringLiteral("writing"), true);
        }
    });
}

void InkModeController::toggleChrome()
{
    if (m_chrome == Chrome::Revealed)
        hideChrome();
    else
        revealChrome();
}

void InkModeController::revealChrome()
{
    applyReveal();
}

void InkModeController::hideChrome()
{
    applyHide(QStringLiteral("explicit"), true);
}

void InkModeController::simulateWritingRetreat()
{
    if (!testBridgeEnabled() || !m_active || !m_ready)
        return;
    if (m_chrome == Chrome::Revealed)
        applyHide(QStringLiteral("writing"), true);
}

bool InkModeController::savePage()
{
    if (!g_inkGoldBuffer)
        return false;
    const QString pagePath = m_noteDir + QStringLiteral("/page-001.png");
    QImage canvas = !m_canvasDirty && !m_captureFrame.isNull()
        ? m_captureFrame
        : g_inkGoldBuffer->copy(0, 0, m_screenW, m_screenH);
    {
        QPainter p(&canvas);
        if (m_chrome == Chrome::Revealed) {
            if (!m_topUnder.isNull())
                p.drawImage(topChromeRect(), m_topUnder);
            if (!m_railUnder.isNull())
                p.drawImage(railChromeRect(), m_railUnder);
        } else if (!m_handleUnder.isNull()) {
            p.drawImage(handleRect(), m_handleUnder);
        }
    }
    const bool ok = canvas.save(pagePath);
    PerfLog::instance().log(ok ? "NOTE_PAGE_SAVED" : "NOTE_PAGE_SAVE_FAILED",
                            {{"path", pagePath}});
    return ok;
}

void InkModeController::setActive(bool active)
{
    if (m_active == active)
        return;
    m_active = active;
    emit activeChanged();
}
