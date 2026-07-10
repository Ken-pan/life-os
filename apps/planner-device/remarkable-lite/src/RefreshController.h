#pragma once

#include <QObject>
#include <QString>

// App-level e-ink repaint policy. Does not touch the display driver: it
// counts page/content updates and asks the UI (via cleanRequested) to run a
// full-screen flash that forces the epaper backend to do a full repaint.
class RefreshController : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QString mode READ mode WRITE setMode NOTIFY modeChanged)
    Q_PROPERTY(int updatesSinceClean READ updatesSinceClean NOTIFY counterChanged)
    Q_PROPERTY(int cleanThreshold READ cleanThreshold NOTIFY modeChanged)

public:
    explicit RefreshController(QObject *parent = nullptr);

    QString mode() const { return m_mode; }
    void setMode(const QString &mode);
    int updatesSinceClean() const { return m_updates; }
    int cleanThreshold() const;

    Q_INVOKABLE void pageUpdated();
    Q_INVOKABLE void requestClean();

signals:
    void modeChanged();
    void counterChanged();
    void cleanRequested();

private:
    QString m_mode = QStringLiteral("balanced");
    int m_updates = 0;

    QString modeFilePath() const;
    void persistMode() const;
};
