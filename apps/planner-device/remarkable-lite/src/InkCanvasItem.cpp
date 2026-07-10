#include "InkCanvasItem.h"

#include <QDateTime>
#include <QPainter>
#include <QPainterPath>
#include <QVariantMap>
#include <cmath>
#include "epframebuffer.h"
#include "ink_raster.h"

namespace {
constexpr qreal kPressureAlpha = 0.45;  // EMA responsiveness
constexpr qreal kMaxWidthStep = 0.5;    // px per sample — no sudden jumps
constexpr qreal kEraserWidth = 30.0;
constexpr qreal kPressureGamma = 1.6;

const QColor kCard("#FFFFFF");
}

InkCanvasItem::InkCanvasItem(QQuickItem *parent) : QQuickPaintedItem(parent)
{
    setOpaquePainting(true);
    setFillColor(kCard);
    setRenderTarget(QQuickPaintedItem::Image);

    m_flushTimer.setInterval(30);
    m_flushTimer.setSingleShot(false);
    connect(&m_flushTimer, &QTimer::timeout, this, &InkCanvasItem::flushDirty);
}

void InkCanvasItem::queueDirty(const QRectF &rect)
{
    m_pendingDirty = m_pendingDirty.united(rect.toAlignedRect());
    if (!m_flushTimer.isActive()) {
        flushDirty();  // first segment paints immediately — no start-lag
        m_flushTimer.start();
    }
}

void InkCanvasItem::flushDirty()
{
    if (!m_pendingDirty.isNull()) {
        update(m_pendingDirty);
        m_pendingDirty = QRect();
    } else if (!m_strokeActive) {
        m_flushTimer.stop();
    }
}

void InkCanvasItem::setCaptureEnabled(bool on)
{
    if (m_captureEnabled == on)
        return;
    m_captureEnabled = on;
    emit captureEnabledChanged();
}

void InkCanvasItem::setTool(const QString &tool)
{
    if (m_tool == tool)
        return;
    m_tool = tool;
    emit toolChanged();
}

void InkCanvasItem::setStrokeColor(const QColor &color)
{
    if (m_color == color)
        return;
    m_color = color;
    emit toolChanged();
}

void InkCanvasItem::setBaseWidth(qreal width)
{
    if (qFuzzyCompare(m_baseWidth, width))
        return;
    m_baseWidth = width;
    emit toolChanged();
}

void InkCanvasItem::geometryChange(const QRectF &newGeometry, const QRectF &oldGeometry)
{
    QQuickPaintedItem::geometryChange(newGeometry, oldGeometry);
    ensureImage();
}

void InkCanvasItem::ensureImage()
{
    const QSize size(qMax(1, int(width())), qMax(1, int(height())));
    if (m_image.size() == size)
        return;
    QImage fresh(size, QImage::Format_RGB32);
    fresh.fill(kCard);
    if (!m_image.isNull()) {
        QPainter p(&fresh);
        p.drawImage(0, 0, m_image);
    }
    m_image = fresh;
}

void InkCanvasItem::paint(QPainter *painter)
{
    if (!m_image.isNull())
        painter->drawImage(0, 0, m_image);
}

void InkCanvasItem::clear()
{
    ensureImage();
    m_image.fill(kCard);
    m_strokes.clear();
    m_redoStack.clear();
    m_strokeActive = false;
    m_hasSegment = false;
    update();
    emit strokesChanged();
}

void InkCanvasItem::undo()
{
    if (m_strokes.isEmpty())
        return;
    m_redoStack.append(m_strokes.takeLast());
    rebuildImage();
    emit strokesChanged();
}

void InkCanvasItem::redo()
{
    if (m_redoStack.isEmpty())
        return;
    m_strokes.append(m_redoStack.takeLast());
    rebuildImage();
    emit strokesChanged();
}

QVariantList InkCanvasItem::allStrokes() const
{
    QVariantList out;
    for (const InkStroke &stroke : m_strokes) {
        QVariantList points;
        for (const StrokePoint &pt : stroke.points)
            points.append(QVariantMap{{"x", pt.x}, {"y", pt.y}, {"p", pt.p}, {"t", pt.t}});
        out.append(QVariantMap{
            {"tool", stroke.tool},
            {"color", stroke.color.name()},
            {"width", stroke.baseWidth},
            {"points", points},
        });
    }
    return out;
}

void InkCanvasItem::rebuildImage()
{
    ensureImage();
    m_image.fill(kCard);
    for (const InkStroke &stroke : m_strokes)
        renderStroke(stroke);
    update();
}

// Replays a stored stroke through the same smoothing pipeline as live ink
// so undo/redo rebuilds are pixel-consistent.
void InkCanvasItem::renderStroke(const InkStroke &stroke)
{
    if (stroke.points.isEmpty())
        return;

    qreal smoothedP = stroke.points.first().p;
    qreal smoothedW = targetWidth(stroke, smoothedP, 0.0);
    QPointF prev(stroke.points.first().x, stroke.points.first().y);
    QPointF last = prev;
    qint64 lastT = stroke.points.first().t;
    bool hasSegment = false;

    drawSegment(stroke, prev, prev, prev, smoothedW, false);

    for (int i = 1; i < stroke.points.size(); ++i) {
        const StrokePoint &pt = stroke.points[i];
        const QPointF pos(pt.x, pt.y);
        smoothedP += kPressureAlpha * (pt.p - smoothedP);
        const qreal dt = qMax<qint64>(1, pt.t - lastT);
        const qreal speed = QLineF(last, pos).length() / dt;
        const qreal target = targetWidth(stroke, smoothedP, speed);
        smoothedW += qBound(-kMaxWidthStep, target - smoothedW, kMaxWidthStep);

        const QPointF midPrev = (prev + last) / 2.0;
        const QPointF midCur = (last + pos) / 2.0;
        drawSegment(stroke, hasSegment ? midPrev : last, last, midCur, smoothedW, false);

        hasSegment = true;
        prev = last;
        last = pos;
        lastT = pt.t;
    }
    if (hasSegment)
        drawSegment(stroke, (prev + last) / 2.0, last, last, smoothedW, false);
}

// Tool feel definitions — pressure response, velocity thinning, and size
// multipliers per brush. This is where "comfortable" lives.
qreal InkCanvasItem::targetWidth(const InkStroke &stroke, qreal pressure, qreal speedPxPerMs) const
{
    const qreal p = qBound(0.0, pressure, 1.0);
    const qreal base = stroke.baseWidth;

    if (stroke.tool == "eraser")
        return kEraserWidth;
    if (stroke.tool == "fineliner")
        return base;  // technical pen: constant width
    if (stroke.tool == "marker")
        return base * 3.4;  // highlighter: wide, pressure-independent

    // Velocity thinning (ballpoint subtle, pencil stronger): fast strokes
    // ride lighter on paper.
    const qreal thinning = stroke.tool == "pencil" ? 0.10 : 0.045;
    const qreal speedFactor = qBound(0.72, 1.0 - speedPxPerMs * thinning, 1.0);

    if (stroke.tool == "pencil")
        return base * (0.55 + 0.85 * std::pow(p, 1.3)) * speedFactor;

    // ballpoint (default): gentle pressure gain around the base width
    return base * (0.62 + 0.76 * std::pow(p, kPressureGamma)) * speedFactor;
}

QPen InkCanvasItem::penFor(const InkStroke &stroke, qreal width) const
{
    QColor color = stroke.tool == "eraser" ? kCard : stroke.color;
    Qt::PenCapStyle cap = Qt::RoundCap;

    if (stroke.tool == "marker") {
        color.setAlphaF(0.42);  // translucent highlighter
        cap = Qt::FlatCap;
    } else if (stroke.tool == "pencil") {
        color.setAlphaF(0.82);  // graphite is never fully opaque
    }
    return QPen(color, width, Qt::SolidLine, cap, Qt::RoundJoin);
}

void InkCanvasItem::drawSegment(const InkStroke &stroke, const QPointF &from,
                                const QPointF &control, const QPointF &to,
                                qreal width, bool notifyUpdate)
{
    ensureImage();
    QPainter p(&m_image);
    // The vendor backend auto-classifies rendered regions to pick an
    // update waveform (epimageutils::scanForContentType); crisp bilevel
    // black strokes are what its dedicated pen waveform (ct33_pen.bin)
    // expects. Antialiased gray halos make ink classify as "image" and
    // repaint on a slower waveform — so dark opaque pen tools render
    // hard-edged. Override with PAPEROS_INK_AA=1/0.
    static const QByteArray aaEnv = qgetenv("PAPEROS_INK_AA");
    const bool bilevelTool = (stroke.tool == "ballpoint" || stroke.tool == "fineliner"
                              || stroke.tool == "eraser")
                             && stroke.color.lightness() < 96;
    const bool useAA = aaEnv.isEmpty() ? !(bilevelTool || stroke.tool == "eraser")
                                       : aaEnv == "1";
    p.setRenderHint(QPainter::Antialiasing, useAA);
    p.setPen(penFor(stroke, width));

    QPainterPath path(from);
    path.quadTo(control, to);
    p.drawPath(path);
    p.end();

    // Rejected Qt/direct hybrid diagnostic path. Product Notes must use the
    // standalone native takeover ink runtime instead. This remains only for
    // forensic comparison when explicitly enabled by env.
    if (m_directStroke) {
        const QPointF sFrom = mapToScene(from);
        const QPointF sTo = mapToScene(to);
        const int radius = qMax(1, int(width / 2.0 + 0.5));
        DirectInk::segment(int(sFrom.x() + 0.5), int(sFrom.y() + 0.5),
                           int(sTo.x() + 0.5), int(sTo.y() + 0.5),
                           radius, stroke.tool == "eraser");
        return;
    }

    if (notifyUpdate) {
        const qreal pad = width + 3;
        queueDirty(path.boundingRect().adjusted(-pad, -pad, pad, pad));
    }
}

void InkCanvasItem::penDown(const QPointF &itemPos, qreal pressure, bool flipEraser)
{
    m_strokeActive = true;

    // Claim the rejected hybrid direct path only when explicitly enabled.
    m_directStroke = false;
    if (DirectInk::enabled()) {
        DirectInk::beginStroke();
        m_directStroke = true;
    }

    m_current = InkStroke();
    m_current.tool = flipEraser ? QStringLiteral("eraser") : m_tool;
    m_current.color = m_color;
    m_current.baseWidth = m_baseWidth;
    m_current.points.append({itemPos.x(), itemPos.y(), pressure,
                             QDateTime::currentMSecsSinceEpoch()});

    m_smoothedPressure = pressure;
    m_smoothedWidth = targetWidth(m_current, pressure, 0.0);
    m_prevPoint = m_lastPoint = itemPos;
    m_lastTimeMs = m_current.points.first().t;
    m_hasSegment = false;

    drawSegment(m_current, itemPos, itemPos, itemPos, m_smoothedWidth, true);
}

void InkCanvasItem::penMove(const QPointF &itemPos, qreal pressure)
{
    if (!m_strokeActive)
        return;

    const qint64 now = QDateTime::currentMSecsSinceEpoch();
    m_smoothedPressure += kPressureAlpha * (pressure - m_smoothedPressure);
    const qreal dt = qMax<qint64>(1, now - m_lastTimeMs);
    const qreal speed = QLineF(m_lastPoint, itemPos).length() / dt;
    const qreal target = targetWidth(m_current, m_smoothedPressure, speed);
    m_smoothedWidth += qBound(-kMaxWidthStep, target - m_smoothedWidth, kMaxWidthStep);

    const QPointF midPrev = (m_prevPoint + m_lastPoint) / 2.0;
    const QPointF midCur = (m_lastPoint + itemPos) / 2.0;
    drawSegment(m_current, m_hasSegment ? midPrev : m_lastPoint, m_lastPoint, midCur,
                m_smoothedWidth, true);

    m_hasSegment = true;
    m_prevPoint = m_lastPoint;
    m_lastPoint = itemPos;
    m_lastTimeMs = now;
    m_current.points.append({itemPos.x(), itemPos.y(), pressure, now});
}

void InkCanvasItem::penUp()
{
    if (!m_strokeActive)
        return;
    if (m_hasSegment)
        drawSegment(m_current, (m_prevPoint + m_lastPoint) / 2.0, m_lastPoint, m_lastPoint,
                    m_smoothedWidth, true);

    m_strokeActive = false;
    if (m_directStroke) {
        DirectInk::endStroke();
        m_directStroke = false;
        // One reconciling Qt repaint of the whole item after the stroke, so
        // the scene graph's copy matches the framebuffer we drew into.
        update();
    } else {
        flushDirty();  // final segments land immediately on pen lift
    }
    m_strokes.append(m_current);
    m_redoStack.clear();
    emit strokesChanged();
}
