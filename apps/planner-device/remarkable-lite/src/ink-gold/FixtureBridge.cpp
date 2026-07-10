#include "FixtureBridge.h"
#include <QCoreApplication>
#include <QImage>
#include <QTcpSocket>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QTimer>
#include <cmath>
#include "PenPipeline.h"
#include "DisplayScheduler.h"
#include "../PerfLog.h"
#include <time.h>
#include <unistd.h>

extern QImage* g_inkGoldBuffer;

FixtureBridge::FixtureBridge(QObject* parent) : QObject(parent) {
    m_timer = new QTimer(this);
    connect(m_timer, &QTimer::timeout, this, &FixtureBridge::onTimerTick);
    connect(&m_server, &QTcpServer::newConnection, this, &FixtureBridge::onNewConnection);
}

bool FixtureBridge::start() {
    return m_server.listen(QHostAddress::LocalHost, 18765);
}

void FixtureBridge::onNewConnection() {
    while (QTcpSocket* socket = m_server.nextPendingConnection()) {
        socket->setParent(this);
        connect(socket, &QTcpSocket::readyRead, this, [this, socket]() {
            QByteArray data = socket->readAll().trimmed();
            QJsonDocument doc = QJsonDocument::fromJson(data);
            if (!doc.isObject()) return;
            QJsonObject cmd = doc.object();
            
            QJsonObject response;
            response["ok"] = true;
            
            QString commandStr = cmd["cmd"].toString();
            if (commandStr == "ping") {
                response["pong"] = true;
            } else if (commandStr == "status") {
                response["running"] = m_timer->isActive();
                response["type"] = m_activeFixtureType;
                response["progress"] = m_frames.empty() ? 1.0 : (double)m_frameIndex / m_frames.size();
            } else if (commandStr == "cancel") {
                if (m_timer->isActive()) {
                    m_timer->stop();
                    finishFixture();
                    response["cancelled"] = true;
                }
            } else if (commandStr == "fixture") {
                if (m_timer->isActive()) {
                    response["ok"] = false;
                    response["error"] = "Fixture already running";
                } else {
                    PerfLog::instance().log("FIXTURE_BEGIN");
                    m_activeFixtureType = cmd["type"].toString();
                    m_frames.clear();
                    m_frameIndex = 0;
                    
                    DisplayScheduler::instance().penDown = true;
                    
                    struct timespec ts;
                    clock_gettime(CLOCK_MONOTONIC_RAW, &ts);
                    uint64_t startNs = ts.tv_sec * 1000000000ULL + ts.tv_nsec;

                    if (m_activeFixtureType == "ink-first-stroke") {
                        for (int i = 0; i < 20; ++i) {
                            PenFrame frame;
                            frame.monotonicNs = startNs + i * 8000000ULL;
                            frame.rawX = 100 + i * 10;
                            frame.rawY = 200;
                            frame.rawPressure = 2000;
                            frame.touching = true;
                            frame.eraserTool = false;
                            m_frames.push_back(frame);
                        }
                        m_timer->start(8);
                    } else if (m_activeFixtureType == "ink-fast-line") {
                        for (int i = 0; i < 100; ++i) {
                            PenFrame frame;
                            frame.monotonicNs = startNs + i * 4000000ULL;
                            frame.rawX = 100 + i * 30;
                            frame.rawY = 400 + (i % 2) * 5;
                            frame.rawPressure = 2500;
                            frame.touching = true;
                            frame.eraserTool = false;
                            m_frames.push_back(frame);
                        }
                        m_timer->start(4);
                    } else if (m_activeFixtureType == "ink-circles") {
                        for (int i = 0; i < 200; ++i) {
                            PenFrame frame;
                            frame.monotonicNs = startNs + i * 4000000ULL;
                            frame.rawX = 400 + 100 * cos(i * 0.1);
                            frame.rawY = 600 + 100 * sin(i * 0.1);
                            frame.rawPressure = 2000;
                            frame.touching = true;
                            frame.eraserTool = false;
                            m_frames.push_back(frame);
                        }
                        m_timer->start(4);
                    } else if (m_activeFixtureType == "ink-pressure-ramp") {
                        for (int i = 0; i < 100; ++i) {
                            PenFrame frame;
                            frame.monotonicNs = startNs + i * 8000000ULL;
                            frame.rawX = 100 + i * 10;
                            frame.rawY = 800;
                            frame.rawPressure = 500 + i * 35;
                            frame.touching = true;
                            frame.eraserTool = false;
                            m_frames.push_back(frame);
                        }
                        m_timer->start(8);
                    } else if (m_activeFixtureType == "ink-eraser-flip") {
                        for (int i = 0; i < 50; ++i) {
                            PenFrame frame;
                            frame.monotonicNs = startNs + i * 8000000ULL;
                            frame.rawX = 200 + i * 10;
                            frame.rawY = 200;
                            frame.rawPressure = 2000;
                            frame.touching = true;
                            frame.eraserTool = true;
                            m_frames.push_back(frame);
                        }
                        m_timer->start(8);
                    } else if (m_activeFixtureType == "ink-scribble-30s") {
                        int total = 30000 / 4;
                        for (int i = 0; i < total; ++i) {
                            PenFrame frame;
                            frame.monotonicNs = startNs + i * 4000000ULL;
                            frame.rawX = 300 + 200 * cos(i * 0.05) + 50 * cos(i * 0.2);
                            frame.rawY = 500 + 200 * sin(i * 0.05) + 50 * sin(i * 0.2);
                            frame.rawPressure = 2000 + 1000 * sin(i * 0.02);
                            frame.touching = true;
                            frame.eraserTool = false;
                            m_frames.push_back(frame);
                        }
                        m_timer->start(4);
                    }
                }
            }
            
            socket->write(QJsonDocument(response).toJson(QJsonDocument::Compact));
            socket->write("\n");
            socket->flush();
            socket->disconnectFromHost();
        });
        connect(socket, &QTcpSocket::disconnected, socket, &QTcpSocket::deleteLater);
    }
}

void FixtureBridge::onTimerTick() {
    if (m_frameIndex < m_frames.size()) {
        PenFrame& frame = m_frames[m_frameIndex++];
        m_pipeline.consumeFrame(frame);
        DisplayScheduler::instance().tick(frame.monotonicNs);
    } else {
        m_timer->stop();
        finishFixture();
    }
}

void FixtureBridge::finishFixture() {
    DisplayScheduler::instance().penDown = false;
    PerfLog::instance().log("CAPTURE_BEGIN");
    if (g_inkGoldBuffer) {
        g_inkGoldBuffer->save("/tmp/paperos-test-driver/shot-0ms.png");
    }
    PerfLog::instance().log("CAPTURE_END");
    PerfLog::instance().log("FIXTURE_END");
}
