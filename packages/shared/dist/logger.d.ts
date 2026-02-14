export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type Logger = {
    debug: (message: string, data?: unknown) => void;
    info: (message: string, data?: unknown) => void;
    warn: (message: string, data?: unknown) => void;
    error: (message: string, data?: unknown) => void;
};
export declare function createLogger(scope: string): Logger;
//# sourceMappingURL=logger.d.ts.map