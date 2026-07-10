#pragma once

#include <QString>
#include <QtGlobal>

// All PaperOS runtime files live under this directory (home-only rule).
inline QString paperosHome()
{
    return qEnvironmentVariable("PAPEROS_HOME", QStringLiteral("/home/root/paperos"));
}
