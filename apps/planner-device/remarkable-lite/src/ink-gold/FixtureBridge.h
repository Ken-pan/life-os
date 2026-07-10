#pragma once
#include <QObject>
#include <QTcpServer>
#include <QTimer>

#include "PenPipeline.h"
#include <vector>

class FixtureBridge : public QObject {
    Q_OBJECT
public:
    explicit FixtureBridge(QObject* parent = nullptr);
    bool start();

private slots:
    void onNewConnection();
    void onTimerTick();

private:
    QTcpServer m_server;
    QTimer* m_timer = nullptr;
    std::vector<PenFrame> m_frames;
    size_t m_frameIndex = 0;
    QString m_activeFixtureType;
    PenPipeline m_pipeline;
    void finishFixture();
};
