#pragma once

#include <QObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QVariantMap>

class ApiClient : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QVariantMap dashboardData READ dashboardData NOTIFY dashboardDataChanged)
    Q_PROPERTY(bool isLoading READ isLoading NOTIFY loadingChanged)
    Q_PROPERTY(QString errorMessage READ errorMessage NOTIFY errorChanged)

public:
    explicit ApiClient(QObject *parent = nullptr);

    QVariantMap dashboardData() const { return m_dashboardData; }
    bool isLoading() const { return m_isLoading; }
    QString errorMessage() const { return m_errorMessage; }

    Q_INVOKABLE void fetchDashboard();

signals:
    void dashboardDataChanged();
    void loadingChanged();
    void errorChanged();

private:
    QNetworkAccessManager m_networkManager;
    QVariantMap m_dashboardData;
    bool m_isLoading = false;
    QString m_errorMessage;
    QString m_apiBaseUrl;

    void loadConfig();
};
