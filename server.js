const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Загружаем переменные окружения
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Настройка CORS с ограничениями
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'];
const io = new Server(server, { 
    maxHttpBufferSize: parseInt(process.env.MAX_FILE_SIZE_MB) * 1e6 || 50e6,
    cors: {
        origin: function(origin, callback) {
            // Разрешаем запросы без origin (mobile apps, curl)
            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true
    }
}); 

const PORT = process.env.PORT || 3000;

const { initDB } = require('./src/db/database');

initDB().then(() => {
    // Запускаем сервер только после успешной инициализации БД
    server.listen(PORT, '0.0.0.0', () => console.log(`Сервер запущен на http://0.0.0.0:${PORT}`));
}).catch(err => {
    console.error('Ошибка инициализации БД:', err);
    process.exit(1);
});

// Helmet для безопасности HTTP заголовков
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.socket.io"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "blob:", "*"],
            mediaSrc: ["'self'", "data:", "blob:", "*"],
            connectSrc: ["'self'", "ws:", "wss:", "*"],
            frameSrc: ["'none'"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// Rate limiting для API endpoints
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 100, // максимум 100 запросов
    message: { success: false, message: 'Слишком много запросов, попробуйте позже' },
    standardHeaders: true,
    legacyHeaders: false,
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 20, // максимум 20 попыток авторизации
    message: { success: false, message: 'Слишком много попыток входа, попробуйте позже' },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', apiLimiter);
app.use('/api/auth', authLimiter);

app.use((req, res, next) => {
    // Разрешаем CORS для статических файлов (чтобы приложение из Capacitor могло скачивать картинки)
    // Примечание: Helmet уже устанавливает заголовки, но для мобильных приложений нужны явные разрешения
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins.join(', ') || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    // Защита от кликджекинга (уже есть в Helmet, но оставляем для совместимости)
    // res.setHeader('X-Frame-Options', 'DENY');
    // Запрещает браузеру "угадывать" тип контента (уже в Helmet)
    // res.setHeader('X-Content-Type-Options', 'nosniff');
    // CSP уже настроен через Helmet
    next();
});

// JSON body parser с увеличенным лимитом для переваривания Base64
app.use(express.json({ limit: '50mb' }));

app.use('/api/auth', require('./src/routes/auth').router);
app.use('/api/upload', require('./src/routes/upload'));

app.use(express.static(path.join(__dirname, 'public')));
const onlineUsers = new Map(); // username -> Set<socket.id>

require('./src/socket/index')(io, onlineUsers);
