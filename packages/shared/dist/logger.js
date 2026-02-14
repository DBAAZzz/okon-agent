function formatData(data) {
    if (data === undefined) {
        return '';
    }
    try {
        return ` ${JSON.stringify(data)}`;
    }
    catch {
        return ` ${String(data)}`;
    }
}
function log(level, scope, message, data) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `${timestamp} [${level}] [${scope}] ${message}${formatData(data)}`;
    switch (level) {
        case 'DEBUG':
            console.debug(formattedMessage);
            break;
        case 'INFO':
            console.info(formattedMessage);
            break;
        case 'WARN':
            console.warn(formattedMessage);
            break;
        case 'ERROR':
            console.error(formattedMessage);
            break;
    }
}
export function createLogger(scope) {
    return {
        debug: (message, data) => log('DEBUG', scope, message, data),
        info: (message, data) => log('INFO', scope, message, data),
        warn: (message, data) => log('WARN', scope, message, data),
        error: (message, data) => log('ERROR', scope, message, data)
    };
}
