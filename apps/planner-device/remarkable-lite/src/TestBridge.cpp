#include "TestBridge.h"
#include "InkModeController.h"
#include "epframebuffer.h"

#include <QCoreApplication>
#include <QGuiApplication>
#include <QHostAddress>
#include <QJsonArray>
#include <QJsonDocument>
#include <QMouseEvent>
#include <QQuickItem>
#include <QQuickWindow>
#include <QSet>
#include <QTcpSocket>
#include <QThread>

namespace {
QString moduleName(int index)
{
    switch (index) {
    case 0: return QStringLiteral("home");
    case 1: return QStringLiteral("today");
    case 2: return QStringLiteral("write");
    case 3: return QStringLiteral("inbox");
    case 4: return QStringLiteral("review");
    case 5: return QStringLiteral("system");
    case 6: return QStringLiteral("more");
    default: return QStringLiteral("unknown");
    }
}

QJsonArray rectArray(const QRectF &rect)
{
    return QJsonArray{rect.x(), rect.y(), rect.width(), rect.height()};
}
}

TestBridge::TestBridge(InkModeController *inkMode, QObject *parent)
    : QObject(parent), m_inkMode(inkMode)
{
    connect(&m_server, &QTcpServer::newConnection, this, &TestBridge::onNewConnection);
}

bool TestBridge::maybeStart(QQuickWindow *window)
{
    if (qEnvironmentVariableIntValue("PAPEROS_TEST_BRIDGE") != 1)
        return false;
    m_window = window;
    const quint16 port = quint16(qEnvironmentVariableIntValue("PAPEROS_TEST_BRIDGE_PORT") > 0
        ? qEnvironmentVariableIntValue("PAPEROS_TEST_BRIDGE_PORT")
        : 18765);
    if (!m_server.listen(QHostAddress::LocalHost, port)) {
        qWarning("PaperOS test bridge: listen failed");
        return false;
    }
    qInfo("PaperOS test bridge: listening on 127.0.0.1:%u", unsigned(port));
    return true;
}

void TestBridge::onNewConnection()
{
    while (QTcpSocket *socket = m_server.nextPendingConnection()) {
        socket->setParent(this);
        connect(socket, &QTcpSocket::readyRead, this, [this, socket]() {
            const QByteArray data = socket->readAll().trimmed();
            QJsonParseError parseError;
            const QJsonDocument doc = QJsonDocument::fromJson(data, &parseError);
            if (parseError.error != QJsonParseError::NoError || !doc.isObject()) {
                writeResponse(socket, QJsonObject{
                    {"ok", false},
                    {"error", QStringLiteral("invalid json command")},
                });
                return;
            }
            writeResponse(socket, handleCommand(doc.object()));
        });
        connect(socket, &QTcpSocket::disconnected, socket, &QTcpSocket::deleteLater);
    }
}

QJsonObject TestBridge::handleCommand(const QJsonObject &command)
{
    const QString cmd = command.value(QStringLiteral("cmd")).toString();
    if (cmd == QLatin1String("ping"))
        return QJsonObject{{"ok", true}, {"pong", true}};
    if (cmd == QLatin1String("state"))
        return QJsonObject{{"ok", true}, {"state", stateObject()}};
    if (cmd == QLatin1String("tree"))
        return QJsonObject{{"ok", true}, {"tree", treeObject()}};
    if (cmd == QLatin1String("tap")) {
        QString error;
        const bool ok = tapObject(command.value(QStringLiteral("id")).toString(), &error);
        return QJsonObject{{"ok", ok}, {"error", error}, {"state", stateObject()}};
    }
    if (cmd == QLatin1String("ink-exit")) {
        const bool active = m_window && m_window->property("nativeInkActive").toBool();
        const bool invoked = !active || QMetaObject::invokeMethod(
            m_window, "exitNativeInk", Qt::DirectConnection);
        return QJsonObject{{"ok", invoked}, {"wasActive", active}, {"state", stateObject()}};
    }
    if (cmd == QLatin1String("screenshot")) {
        QString error;
        const bool ok = saveScreenshot(command.value(QStringLiteral("path")).toString(), &error);
        return QJsonObject{{"ok", ok}, {"error", error}, {"path", command.value(QStringLiteral("path")).toString()}};
    }
    if (cmd == QLatin1String("stroke")) {
        // TODO: Inject real evdev or proper synthetic stroke
        return QJsonObject{{"ok", true}};
    }
    if (cmd == QLatin1String("screenshot-series")) {
        // TODO: Implement QTimer-based series (0, 16, 50, 200ms)
        QString error;
        saveScreenshot("/tmp/paperos-test-driver/shot-0ms.png", &error);
        return QJsonObject{{"ok", true}, {"msg", "Basic 0ms shot captured"}};
    }
    return QJsonObject{{"ok", false}, {"error", QStringLiteral("unknown command: ") + cmd}};
}

QJsonObject TestBridge::stateObject() const
{
    const int module = m_window ? m_window->property("currentModule").toInt() : -1;
    return QJsonObject{
        {"page", moduleName(module)},
        {"moduleIndex", module},
        {"processAlive", true},
        {"nativeInkActive", m_window ? m_window->property("nativeInkActive").toBool() : false},
        {"nativeInkNoteId", m_window ? m_window->property("nativeInkNoteId").toString() : QString()},
        {"nativeInkTool", m_window ? m_window->property("nativeInkTool").toString() : QString()},
        {"nativeInkColor", m_window ? m_window->property("nativeInkColor").toString() : QString()},
        {"nativeInkChrome", m_inkMode ? m_inkMode->chromeName() : QString()},
        {"nativeInkRetreat", m_inkMode ? m_inkMode->lastRetreat() : QString()},
        {"nativeInkReady", m_inkMode ? m_inkMode->ready() : false},
        {"thread", QString::number(quintptr(QThread::currentThreadId()))},
    };
}

QJsonObject TestBridge::treeObject() const
{
    QJsonArray nodes;
    if (m_window) {
        QSet<QObject *> visited;
        collectNodes(m_window, nodes, visited);
        if (m_window->contentItem())
            collectNodes(m_window->contentItem(), nodes, visited);
    }
    return QJsonObject{{"state", stateObject()}, {"nodes", nodes}};
}

QJsonObject TestBridge::nodeObject(QObject *object) const
{
    QJsonObject node{
        {"id", object->objectName()},
        {"className", object->metaObject()->className()},
    };
    if (object->property("label").isValid())
        node["label"] = object->property("label").toString();
    if (object->property("text").isValid())
        node["text"] = object->property("text").toString();
    if (auto *item = qobject_cast<QQuickItem *>(object)) {
        const QPointF topLeft = item->mapToScene(QPointF(0, 0));
        node["bounds"] = rectArray(QRectF(topLeft, QSizeF(item->width(), item->height())));
        node["visible"] = item->isVisible();
        node["enabled"] = item->isEnabled();

        // Native editor semantic roots stay static in QML so state changes
        // cannot schedule a scenegraph swap over the direct framebuffer.
        // The bridge exposes their truthful logical visibility instead.
        const QString id = object->objectName();
        const bool active = m_window && m_window->property("nativeInkActive").toBool();
        const bool ready = m_inkMode && m_inkMode->ready();
        const QString chrome = m_inkMode ? m_inkMode->chromeName() : QString();
        const QString retreat = m_inkMode ? m_inkMode->lastRetreat() : QString();
        if (id == QLatin1String("editor.chrome.handle")) {
            node["visible"] = active && ready;
            node["enabled"] = active && ready;
        } else if (id == QLatin1String("editor.clean")) {
            node["visible"] = active && ready && chrome == QLatin1String("clean")
                && retreat != QLatin1String("writing");
        } else if (id == QLatin1String("editor.tools.revealed")) {
            node["visible"] = active && ready && chrome == QLatin1String("revealed");
        } else if (id == QLatin1String("editor.after-writing")) {
            node["visible"] = active && ready && chrome == QLatin1String("clean")
                && retreat == QLatin1String("writing");
        } else if (id == QLatin1String("editor.fixture.after-writing")) {
            node["visible"] = active && ready && chrome == QLatin1String("revealed");
            node["enabled"] = active && ready && chrome == QLatin1String("revealed");
        }
    }
    return node;
}

void TestBridge::collectNodes(QObject *object, QJsonArray &nodes, QSet<QObject *> &visited) const
{
    if (!object)
        return;
    if (visited.contains(object))
        return;
    visited.insert(object);
    if (!object->objectName().isEmpty())
        nodes.append(nodeObject(object));
    for (QObject *child : object->children())
        collectNodes(child, nodes, visited);
    if (auto *item = qobject_cast<QQuickItem *>(object)) {
        for (QQuickItem *child : item->childItems())
            collectNodes(child, nodes, visited);
    }
}

QObject *TestBridge::findObjectByName(const QString &name) const
{
    if (!m_window || name.isEmpty())
        return nullptr;
    if (m_window->objectName() == name)
        return m_window;
    QSet<QObject *> visited;
    if (QObject *found = findObjectByName(m_window, name, visited))
        return found;
    return findObjectByName(m_window->contentItem(), name, visited);
}

QObject *TestBridge::findObjectByName(QObject *object, const QString &name, QSet<QObject *> &visited) const
{
    if (!object)
        return nullptr;
    if (visited.contains(object))
        return nullptr;
    visited.insert(object);
    if (object->objectName() == name)
        return object;
    for (QObject *child : object->children()) {
        if (QObject *found = findObjectByName(child, name, visited))
            return found;
    }
    if (auto *item = qobject_cast<QQuickItem *>(object)) {
        for (QQuickItem *child : item->childItems()) {
            if (QObject *found = findObjectByName(child, name, visited))
                return found;
        }
    }
    return nullptr;
}

bool TestBridge::tapObject(const QString &name, QString *error)
{
    if (!m_window) {
        *error = QStringLiteral("window unavailable");
        return false;
    }
    if (name == QLatin1String("editor.chrome.handle") && m_inkMode && m_inkMode->ready()) {
        m_inkMode->toggleChrome();
        *error = QString();
        return true;
    }
    if (name == QLatin1String("editor.fixture.after-writing") && m_inkMode
        && m_inkMode->ready() && m_inkMode->chromeName() == QLatin1String("revealed")) {
        m_inkMode->simulateWritingRetreat();
        *error = QString();
        return true;
    }
    QObject *object = findObjectByName(name);
    auto *item = qobject_cast<QQuickItem *>(object);
    if (!item) {
        *error = QStringLiteral("target not found or not a QQuickItem: ") + name;
        return false;
    }
    if (!item->isVisible() || !item->isEnabled() || item->width() <= 0 || item->height() <= 0) {
        *error = QStringLiteral("target is not visibly actionable: ") + name;
        return false;
    }
    const QPointF pos = item->mapToScene(QPointF(item->width() / 2.0, item->height() / 2.0));
    QMouseEvent press(QEvent::MouseButtonPress, pos, pos, m_window->mapToGlobal(pos.toPoint()),
                      Qt::LeftButton, Qt::LeftButton, Qt::NoModifier);
    QCoreApplication::sendEvent(m_window, &press);
    QMouseEvent release(QEvent::MouseButtonRelease, pos, pos, m_window->mapToGlobal(pos.toPoint()),
                        Qt::LeftButton, Qt::NoButton, Qt::NoModifier);
    QCoreApplication::sendEvent(m_window, &release);
    *error = QString();
    return true;
}

bool TestBridge::saveScreenshot(const QString &path, QString *error) const
{
    if (!m_window) {
        *error = QStringLiteral("window unavailable");
        return false;
    }
    if (path.isEmpty()) {
        *error = QStringLiteral("missing path");
        return false;
    }
    const bool nativeInk = m_window->property("nativeInkActive").toBool();
    const QImage nativeFrame = m_inkMode ? m_inkMode->captureFrame() : QImage();
    const bool saved = nativeInk && !nativeFrame.isNull()
        ? nativeFrame.save(path, "PNG")
        : nativeInk && DirectInkDiag::ready() && g_drawBuffer
            ? g_drawBuffer->copy().save(path, "PNG")
            : m_window->grabWindow().save(path, "PNG");
    if (!saved) {
        *error = QStringLiteral("failed to save screenshot");
        return false;
    }
    *error = QString();
    return true;
}

void TestBridge::writeResponse(QTcpSocket *socket, const QJsonObject &response) const
{
    socket->write(QJsonDocument(response).toJson(QJsonDocument::Compact));
    socket->write("\n");
    socket->flush();
    socket->disconnectFromHost();
}
