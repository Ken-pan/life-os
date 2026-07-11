#pragma once

#include <QObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QVariantMap>
#include <QString>
#include <QTimer>

class ApiClient : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QVariantMap dashboardData READ dashboardData NOTIFY dashboardDataChanged)
    Q_PROPERTY(bool isLoading READ isLoading NOTIFY loadingChanged)
    Q_PROPERTY(QString errorMessage READ errorMessage NOTIFY errorChanged)
    Q_PROPERTY(QString mode READ mode CONSTANT)
    Q_PROPERTY(QString lastSync READ lastSync NOTIFY lastSyncChanged)
    Q_PROPERTY(QString syncState READ syncState NOTIFY syncStateChanged)
    Q_PROPERTY(QString syncSummary READ syncSummary NOTIFY syncStateChanged)

public:
    explicit ApiClient(QObject *parent = nullptr);

    QVariantMap dashboardData() const { return m_dashboardData; }
    bool isLoading() const { return m_isLoading; }
    QString errorMessage() const { return m_errorMessage; }
    QString mode() const { return m_mode; }
    QString lastSync() const { return m_lastSync; }
    QString syncState() const { return m_syncState; }
    QString syncSummary() const;

    Q_INVOKABLE void fetchDashboard();
    Q_INVOKABLE QVariantMap readCacheFile(const QString &name) const;

signals:
    void dashboardDataChanged();
    void loadingChanged();
    void errorChanged();
    void lastSyncChanged();
    void syncStateChanged();

private:
    QNetworkAccessManager m_networkManager;
    QVariantMap m_dashboardData;
    bool m_isLoading = false;
    QString m_errorMessage;
    QString m_apiBaseUrl;
    QString m_mode;
    QString m_token;
    QString m_tokenFile;
    QString m_cachePath;
    QString m_lastSyncPath;
    QString m_lastSync;
    QString m_syncState = "idle";
    QTimer m_freshnessTimer;

    void loadConfig();
    void loadCache();
    bool saveCache(const QByteArray &payload);
    bool hasCachedDashboard() const;
    bool isCacheStale() const;
    void setSyncState(const QString &state);
    void setFailure(const QString &message);
    QString readFileTrimmed(const QString &path) const;
};
