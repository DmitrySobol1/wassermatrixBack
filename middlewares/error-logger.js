import winston from 'winston'
import expressWinston from 'express-winston'

export const requestLogger = expressWinston.logger({
    transports: [
        new winston.transports.Console({
            format: winston.format.simple()
        }),
        new winston.transports.File({
            filename:'logs/requests.log'
        })
    ],
    format: winston.format.json()
})


export const errorLogger = expressWinston.errorLogger({
    transports: [
         new winston.transports.Console({
            format: winston.format.simple()
        }),
        new winston.transports.File({
            filename:'logs/errors.log'
        })
    ],
    format: winston.format.json()
})


// для ошибок, которые я сам ловлю в try/catch
export const logger = winston.createLogger({
  level: 'info', 
  format: winston.format.combine(
    winston.format.timestamp({ format: 'DD-MM-YYYY HH:mm:ss' }),
    winston.format.json(),
    
  ),
  transports: [
    new winston.transports.Console(), // вывод в консоль
    new winston.transports.File({ filename: 'logs/tryCatchLogger.log', level: 'error' }),
  ],
});