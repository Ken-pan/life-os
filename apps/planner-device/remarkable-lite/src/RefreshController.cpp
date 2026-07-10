#include "RefreshController.h"
#include "PaperOsPaths.h"

#include <QFile>
#include <QDebug>

RefreshController::RefreshController(QObject *parent) : QObject(parent)
{
    QFile file(modeFilePath());
    if (file.open(QIODevice::ReadOnly)) {
        const QString saved = QString::fromUtf8(file.readAll()).trimmed();
        if (saved == "clean" || saved == "balanced" || saved == "fast")
            m_mode = saved;
    }
    qInfo() << "PaperOS refresh mode:" << m_mode;
}

QString RefreshController::modeFilePath() const
{
    return paperosHome() + QStringLiteral("/refresh_mode.txt");
}

int RefreshController::cleanThreshold() const
{
    if (m_mode == "clean")
        return 1;
    if (m_mode == "fast")
        return 16;
    return 6; // balanced
}

void RefreshController::setMode(const QString &mode)
{
    if (mode == m_mode || (mode != "clean" && mode != "balanced" && mode != "fast"))
        return;
    m_mode = mode;
    m_updates = 0;
    persistMode();
    qInfo() << "PaperOS refresh mode:" << m_mode;
    emit modeChanged();
    emit counterChanged();
}

void RefreshController::persistMode() const
{
    QFile file(modeFilePath());
    if (file.open(QIODevice::WriteOnly | QIODevice::Truncate))
        file.write(m_mode.toUtf8() + "\n");
}

void RefreshController::pageUpdated()
{
    ++m_updates;
    emit counterChanged();
    if (m_updates >= cleanThreshold())
        requestClean();
}

void RefreshController::requestClean()
{
    m_updates = 0;
    emit counterChanged();
    emit cleanRequested();
}
