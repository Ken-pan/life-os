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

ApiClient::ApiClient(QObject *parent) : QObject(parent)
{
    loadConfig();
    loadCache();
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
}

void ApiClient::saveCache(const QByteArray &payload)
{
    QFileInfo info(m_cachePath);
    QDir().mkpath(info.absolutePath());

    QFile file(m_cachePath + ".tmp");
    if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
        qWarning() << "Could not write cache" << file.fileName();
        return;
    }
    file.write(payload);
    file.close();

    QFile::remove(m_cachePath);
    QFile::rename(file.fileName(), m_cachePath);

    m_lastSync = QDateTime::currentDateTimeUtc().toString(Qt::ISODate);
    QFile syncFile(m_lastSyncPath);
    if (syncFile.open(QIODevice::WriteOnly | QIODevice::Truncate)) {
        syncFile.write(m_lastSync.toUtf8());
        syncFile.write("\n");
    }
    emit lastSyncChanged();
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

    QString endpoint = (m_mode == "real") ? "/api/paper/today" : "/api/paper/mock/today";
    QUrl url(m_apiBaseUrl + endpoint);
    
    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");

    if (m_mode == "real") {
        if (m_token.isEmpty()) {
            m_isLoading = false;
            m_errorMessage = "Missing device token";
            emit loadingChanged();
            emit errorChanged();
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
            if (doc.isObject()) {
                m_dashboardData = doc.object().toVariantMap();
                saveCache(payload);
                emit dashboardDataChanged();
            } else {
                m_errorMessage = "Invalid JSON format";
                emit errorChanged();
            }
        } else {
            if (reply->error() == QNetworkReply::AuthenticationRequiredError || reply->error() == QNetworkReply::ContentAccessDenied) {
                m_errorMessage = "Auth Error (" + QString::number(reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt()) + "): Check Token";
            } else {
                m_errorMessage = reply->errorString();
            }
            emit errorChanged();
        }
        reply->deleteLater();
    });
}
