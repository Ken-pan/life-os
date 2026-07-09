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
    m_mode = "mock";

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
            if (obj.contains("mode")) {
                m_mode = obj["mode"].toString();
            }
            if (obj.contains("token")) {
                m_token = obj["token"].toString();
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

    QString endpoint = (m_mode == "real") ? "/api/paper/today" : "/api/paper/mock/today";
    QUrl url(m_apiBaseUrl + endpoint);
    
    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");

    if (m_mode == "real" && !m_token.isEmpty()) {
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
            QJsonDocument doc = QJsonDocument::fromJson(reply->readAll());
            if (doc.isObject()) {
                m_dashboardData = doc.object().toVariantMap();
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
