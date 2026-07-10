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
    setActive(true);
    // One render pass for the static overlay so the scenegraph's last swap
    // is done before direct framebuffer control starts.
    QTimer::singleShot(300, this, [this]() { beginSession(); });
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
    m_evdev->frameFilter = [this](const PenFrame &f) -> bool {
        const QPoint point(f.mappedX, f.mappedY);
        const bool inControls = m_landscape
            ? f.mappedY < kLandscapeBarH
            : (f.mappedY < kPortraitTitleH || f.mappedX < kPortraitRailW);
        if (f.touching && !m_penWasDown) {
            m_penWasDown = true;
            m_downInBackZone = backZone(m_landscape).contains(point);
            m_downInHeader = inControls;
        } else if (!f.touching && m_penWasDown) {
            m_penWasDown = false;
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
        }
        if (m_downInHeader || m_downInBackZone)
            return true;
        if (f.touching && inControls)
            return true;
        return false;
    };

    m_evdev->setAcceptInput(true);
    PerfLog::instance().log("INK_MODE_LIVE");
}

void InkModeController::leave(int code)
{
    if (m_leaving)
        return;
    m_leaving = true;

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
            p.drawImage(QRect(0, 0, m_screenW, m_screenH), prior);
            PerfLog::instance().log("NOTE_PAGE_RESTORED", {{"path", pagePath}});
        }
    }

    p.end();
    drawToolbar();
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
    if (EPFramebuffer *ep = EPFramebuffer::instance())
        ep->sendSwap(m_landscape
                         ? QRect(0, 0, m_screenW, kLandscapeBarH + 3)
                         : QRect(0, 0, kPortraitRailW + 3, m_screenH),
                     EPContentType::Color,
                     EPScreenMode::Quality3, EPFramebuffer::NoRefresh);
    PerfLog::instance().log("INK_TOOL_CHANGED", {{"tool", tool()}, {"color", color()}});
    emit toolChanged();
    return true;
}

bool InkModeController::savePage()
{
    if (!g_inkGoldBuffer)
        return false;
    const QString pagePath = m_noteDir + QStringLiteral("/page-001.png");
    const bool ok = g_inkGoldBuffer->copy(0, 0, m_screenW, m_screenH).save(pagePath);
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
