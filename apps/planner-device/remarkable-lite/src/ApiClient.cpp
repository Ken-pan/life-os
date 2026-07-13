#include "ApiClient.h"
#include <QNetworkRequest>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QFile>
#include <QDebug>
#include <QSslConfiguration>
#include <QDateTime>
#include <QFileInfo>
#include <QDir>
#include <QSaveFile>

namespace {
constexpr qint64 kStaleThresholdSeconds = 60 * 60;
}

ApiClient::ApiClient(QObject *parent) : QObject(parent)
{
    loadConfig();
    loadCache();

    m_freshnessTimer.setInterval(60 * 1000);
    connect(&m_freshnessTimer, &QTimer::timeout, this, [this]() {
        if (!m_isLoading && m_syncState != "failure" && hasCachedDashboard()) {
            setSyncState(isCacheStale() ? "stale" : "current");
        }
    });
    m_freshnessTimer.start();
}

void ApiClient::loadConfig()
{
    m_apiBaseUrl = "https://planner.kenos.space";
    m_mode = "real";
    m_tokenFile = "/home/root/paperos/token";
    m_cachePath = "/home/root/paperos/cache.json";
    m_lastSyncPath = "/home/root/paperos/last_sync.txt";

    QFile file("/home/root/paperos/config.json");
    if (!file.exists()) {
        file.setFileName("config.json"); // fallback for local runs
    }

    if (file.open(QIODevice::ReadOnly)) {
        QJsonDocument doc = QJsonDocument::fromJson(file.readAll());
        if (doc.isObject()) {
            QJsonObject obj = doc.object();
            if (obj.contains("apiBaseUrl")) {
                m_apiBaseUrl = obj["apiBaseUrl"].toString();
            }
            if (obj.contains("mode")) {
                m_mode = obj["mode"].toString();
            }
            if (obj.contains("token")) {
                m_token = obj["token"].toString();
            }
            if (obj.contains("tokenFile")) {
                m_tokenFile = obj["tokenFile"].toString();
            }
            if (obj.contains("cachePath")) {
                m_cachePath = obj["cachePath"].toString();
            }
            if (obj.contains("lastSyncPath")) {
                m_lastSyncPath = obj["lastSyncPath"].toString();
            }
        }
        file.close();
    }

    if (m_token.isEmpty() && !m_tokenFile.isEmpty()) {
        m_token = readFileTrimmed(m_tokenFile);
    }
}

QString ApiClient::readFileTrimmed(const QString &path) const
{
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly)) {
        return "";
    }
    return QString::fromUtf8(file.readAll()).trimmed();
}

void ApiClient::loadCache()
{
    QFile file(m_cachePath);
    if (file.open(QIODevice::ReadOnly)) {
        const QByteArray payload = file.readAll();
        QJsonDocument doc = QJsonDocument::fromJson(payload);
        if (doc.isObject()) {
            m_dashboardData = doc.object().toVariantMap();
            emit dashboardDataChanged();
        }
    }

    m_lastSync = readFileTrimmed(m_lastSyncPath);
    emit lastSyncChanged();
    if (hasCachedDashboard()) {
        setSyncState(isCacheStale() ? "stale" : "current");
    }
}

bool ApiClient::saveCache(const QByteArray &payload)
{
    QFileInfo info(m_cachePath);
    if (!QDir().mkpath(info.absolutePath())) {
        qWarning() << "Could not create PaperOS cache directory" << info.absolutePath();
        return false;
    }

    QSaveFile cacheFile(m_cachePath);
    if (!cacheFile.open(QIODevice::WriteOnly) || cacheFile.write(payload) != payload.size() || !cacheFile.commit()) {
        qWarning() << "Could not atomically write cache" << m_cachePath;
        return false;
    }

    const QString timestamp = QDateTime::currentDateTimeUtc().toString(Qt::ISODate);
    const QByteArray timestampBytes = timestamp.toUtf8();
    QSaveFile syncFile(m_lastSyncPath);
    if (!syncFile.open(QIODevice::WriteOnly)
        || syncFile.write(timestampBytes) != timestampBytes.size()
        || syncFile.write("\n") != 1
        || !syncFile.commit()) {
        qWarning() << "Could not atomically write last sync timestamp" << m_lastSyncPath;
        return false;
    }

    m_lastSync = timestamp;
    emit lastSyncChanged();
    return true;
}

bool ApiClient::hasCachedDashboard() const
{
    return !m_dashboardData.isEmpty();
}

bool ApiClient::isCacheStale() const
{
    const QDateTime lastSyncAt = QDateTime::fromString(m_lastSync, Qt::ISODate);
    if (!lastSyncAt.isValid()) {
        return true;
    }
    return lastSyncAt.secsTo(QDateTime::currentDateTimeUtc()) > kStaleThresholdSeconds;
}

void ApiClient::setSyncState(const QString &state)
{
    if (m_syncState == state) {
        return;
    }
    m_syncState = state;
    emit syncStateChanged();
}

void ApiClient::setFailure(const QString &message)
{
    m_errorMessage = message;
    emit errorChanged();
    setSyncState("failure");
}

QString ApiClient::syncSummary() const
{
    if (m_syncState == "syncing") return "Syncing...";
    if (m_syncState == "current") return "Current · synced " + m_lastSync;
    if (m_syncState == "stale") return "Stale · cached " + m_lastSync;
    if (m_syncState == "failure") {
        if (!hasCachedDashboard()) return "Sync failed · no cached dashboard";
        return "Sync failed · showing "
            + (isCacheStale() ? QStringLiteral("stale") : QStringLiteral("current"))
            + " cache " + m_lastSync;
    }
    return "Idle · no cached dashboard";
}

// Reads an optional side-cache file (cache/<name>.json) for domains the
// Today API does not cover yet (calendar, mail, notes index). Missing file
// returns an empty map — pages must render an empty state, never fail.
QVariantMap ApiClient::readCacheFile(const QString &name) const
{
    QFileInfo info(m_cachePath);
    QFile file(info.absolutePath() + "/cache/" + name + ".json");
    if (!file.open(QIODevice::ReadOnly))
        return {};
    const QJsonDocument doc = QJsonDocument::fromJson(file.readAll());
    return doc.isObject() ? doc.object().toVariantMap() : QVariantMap{};
}

void ApiClient::fetchDashboard()
{
    m_isLoading = true;
    m_errorMessage = "";
    emit loadingChanged();
    emit errorChanged();
    setSyncState("syncing");

    QString endpoint = (m_mode == "real") ? "/api/paper/today" : "/api/paper/mock/today";
    QUrl url(m_apiBaseUrl + endpoint);
    
    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");

    if (m_mode == "real") {
        if (m_token.isEmpty()) {
            m_isLoading = false;
            emit loadingChanged();
            setFailure("Missing device token");
            return;
        }
        request.setRawHeader("Authorization", ("Bearer " + m_token).toUtf8());
    }

    // Since we're doing local network/mock fetch, sometimes SSL is strict. Ignore SSL errors if needed.
    QSslConfiguration conf = request.sslConfiguration();
    conf.setPeerVerifyMode(QSslSocket::VerifyNone);
    request.setSslConfiguration(conf);

    QNetworkReply *reply = m_networkManager.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        m_isLoading = false;
        emit loadingChanged();

        if (reply->error() == QNetworkReply::NoError) {
            const QByteArray payload = reply->readAll();
            QJsonDocument doc = QJsonDocument::fromJson(payload);
            const QJsonObject dashboard = doc.object();
            if (doc.isObject() && dashboard.contains("today")) {
                if (!saveCache(payload)) {
                    setFailure("Could not save dashboard cache");
                } else {
                    m_dashboardData = dashboard.toVariantMap();
                    setSyncState("current");
                }
                emit dashboardDataChanged();
            } else {
                setFailure("Invalid dashboard response");
            }
        } else {
            if (reply->error() == QNetworkReply::AuthenticationRequiredError || reply->error() == QNetworkReply::ContentAccessDenied) {
                setFailure("Auth Error (" + QString::number(reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt()) + "): Check Token");
            } else {
                setFailure(reply->errorString());
            }
        }
        reply->deleteLater();
    });
}
