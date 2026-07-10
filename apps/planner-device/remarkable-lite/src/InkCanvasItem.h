#pragma once

#include <QColor>
#include <QImage>
#include <QQuickPaintedItem>
#include <QTimer>
#include <QVariantList>
#include <QVector>

// Low-latency ink surface with an industry-standard tool system:
// ballpoint / fineliner / marker / pencil / eraser, a color palette for
// the Move's color e-ink panel, S/M/L widths, and undo/redo via stroke
// replay. PenInputService calls penDown/Move/Up directly (C++ fast path);
// only the touched segment rect is re-uploaded per sample.
class InkCanvasItem : public QQuickPaintedItem
{
    Q_OBJECT
    Q_PROPERTY(bool captureEnabled READ captureEnabled WRITE setCaptureEnabled NOTIFY captureEnabledChanged)
    Q_PROPERTY(QString tool READ tool WRITE setTool NOTIFY toolChanged)
    Q_PROPERTY(QColor strokeColor READ strokeColor WRITE setStrokeColor NOTIFY toolChanged)
    Q_PROPERTY(qreal baseWidth READ baseWidth WRITE setBaseWidth NOTIFY toolChanged)
    Q_PROPERTY(bool canUndo READ canUndo NOTIFY strokesChanged)
    Q_PROPERTY(bool canRedo READ canRedo NOTIFY strokesChanged)
    Q_PROPERTY(int strokeCount READ strokeCount NOTIFY strokesChanged)

public:
    explicit InkCanvasItem(QQuickItem *parent = nullptr);

    void paint(QPainter *painter) override;

    bool captureEnabled() const { return m_captureEnabled; }
    void setCaptureEnabled(bool on);
    QString tool() const { return m_tool; }
    void setTool(const QString &tool);
    QColor strokeColor() const { return m_color; }
    void setStrokeColor(const QColor &color);
    qreal baseWidth() const { return m_baseWidth; }
    void setBaseWidth(qreal width);
    bool canUndo() const { return !m_strokes.isEmpty(); }
    bool canRedo() const { return !m_redoStack.isEmpty(); }
    int strokeCount() const { return m_strokes.size(); }

    Q_INVOKABLE void clear();
    Q_INVOKABLE void undo();
    Q_INVOKABLE void redo();
    Q_INVOKABLE QVariantList allStrokes() const;

    void penDown(const QPointF &itemPos, qreal pressure, bool flipEraser);
    void penMove(const QPointF &itemPos, qreal pressure);
    void penUp();
    bool strokeActive() const { return m_strokeActive; }

signals:
    void captureEnabledChanged();
    void toolChanged();
    void strokesChanged();

protected:
    void geometryChange(const QRectF &newGeometry, const QRectF &oldGeometry) override;

private:
    struct StrokePoint { qreal x, y, p; qint64 t; };
    struct InkStroke {
        QString tool;
        QColor color;
        qreal baseWidth = 3.2;
        QVector<StrokePoint> points;
    };

    void ensureImage();
    void rebuildImage();
    void queueDirty(const QRectF &rect);
    void flushDirty();
    void renderStroke(const InkStroke &stroke);
    qreal targetWidth(const InkStroke &stroke, qreal pressure, qreal speedPxPerMs) const;
    QPen penFor(const InkStroke &stroke, qreal width) const;
    void drawSegment(const InkStroke &stroke, const QPointF &from, const QPointF &control,
                     const QPointF &to, qreal width, bool notifyUpdate);

    QImage m_image;
    bool m_captureEnabled = false;

    QString m_tool = QStringLiteral("ballpoint");
    QColor m_color = QColor("#171717");
    qreal m_baseWidth = 3.2;

    QVector<InkStroke> m_strokes;
    QVector<InkStroke> m_redoStack;

    // Live-stroke state.
    bool m_strokeActive = false;
    InkStroke m_current;
    QPointF m_prevPoint, m_lastPoint;
    qint64 m_lastTimeMs = 0;
    bool m_hasSegment = false;
    bool m_directStroke = false;   // rejected Qt/direct hybrid diagnostic
    qreal m_smoothedPressure = 0.0;
    qreal m_smoothedWidth = 2.0;

    // Dirty-rect batching: per-segment updates at pen rate collide with
    // in-flight e-ink refreshes and get dropped (the "dashed live line").
    // Segments accumulate here and flush as one contiguous rect.
    QRect m_pendingDirty;
    QTimer m_flushTimer;
};
