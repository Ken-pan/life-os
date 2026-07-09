#include "ApiClient.h"
#include <QNetworkRequest>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QFile>
#include <QDebug>
#include <QSslConfiguration>

ApiClient::ApiClient(QObject *parent) : QObject(parent)
{
    loadConfig();
}

void ApiClient::loadConfig()
{
    m_apiBaseUrl = "https://planner.kenos.space";

    QFile file("/home/root/planneros-lite/config.json");
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
        }
        file.close();
    }
}

void ApiClient::fetchDashboard()
{
    m_isLoading = true;
    m_errorMessage = "";
    emit loadingChanged();
    emit errorChanged();

    QUrl url(m_apiBaseUrl + "/api/paper/mock/today");
    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");

    // Since we're doing local network/mock fetch, sometimes SSL is strict. Ignore SSL errors if needed.
    QSslConfiguration conf = request.sslConfiguration();
    conf.setPeerVerifyMode(QSslSocket::VerifyNone);
    request.setSslConfiguration(conf);

    QNetworkReply *reply = m_networkManager.get(request);
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        m_isLoading = false;
        emit loadingChanged();

        if (reply->error() == QNetworkReply::NoError) {
            QJsonDocument doc = QJsonDocument::fromJson(reply->readAll());
            if (doc.isObject()) {
                m_dashboardData = doc.object().toVariantMap();
                emit dashboardDataChanged();
            } else {
                m_errorMessage = "Invalid JSON format";
                emit errorChanged();
            }
        } else {
            m_errorMessage = reply->errorString();
            emit errorChanged();
        }
        reply->deleteLater();
    });
}
