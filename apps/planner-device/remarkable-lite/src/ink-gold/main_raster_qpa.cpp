#include <QGuiApplication>
#include <QRasterWindow>
#include <QPainter>
#include <QImage>
#include <QTimer>
#include "FixtureBridge.h"
#include "../PerfLog.h"
#include "DisplayScheduler.h"

QImage* g_inkGoldBuffer = nullptr;

class InkWindow : public QRasterWindow {
protected:
    void paintEvent(QPaintEvent *) override {
        if (!g_inkGoldBuffer) return;
        PerfLog::instance().log("PAINT_EVENT_BEGIN");
        QPainter painter(this);
        painter.drawImage(0, 0, *g_inkGoldBuffer);
        PerfLog::instance().log("PAINT_EVENT_END");
    }
};

InkWindow* g_inkWindow = nullptr;

int main(int argc, char *argv[]) {
    qputenv("QT_QPA_PLATFORM", "epaper");
    QGuiApplication app(argc, argv);
    
    PerfLog::instance().log("DISPLAY_INIT_BEGIN");
    
    g_inkGoldBuffer = new QImage(954, 1696, QImage::Format_RGB32);
    g_inkGoldBuffer->fill(Qt::white);
    
    g_inkWindow = new InkWindow();
    g_inkWindow->setGeometry(0, 0, 954, 1696);
    g_inkWindow->showFullScreen();
    DisplayScheduler::instance().presenter = [](const QRect& r) {
        if (g_inkWindow) g_inkWindow->update(r);
    };
    
    PerfLog::instance().log("DISPLAY_INIT_END");
    PerfLog::instance().log("DISPLAY_READY");

    FixtureBridge bridge;
    if (bridge.start()) {
        qWarning("FixtureBridge listening on 18765");
    }

    return app.exec();
}
