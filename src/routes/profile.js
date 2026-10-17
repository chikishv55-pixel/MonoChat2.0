const router = require('express').Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const jwt = require('../utils/jwt');
const { JWT_SECRET } = require('./auth');
const { dbGet, dbRun } = require('../db/database');

router.use((req, res, next) => {
    try {
        const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
        req.username = jwt.verify(token || '', JWT_SECRET).username;
        next();
    } catch { res.status(401).json({ success: false, message: 'Войдите в аккаунт.' }); }
});

router.get('/:username/cover', async (req, res) => {
    try {
        const user = await dbGet('SELECT cover_image, cover_blur, cover_snow, cover_effect, cover_ring, is_premium FROM users WHERE username = ?', [req.params.username]);
        if (!user) return res.status(404).json({ success: false, message: 'Профиль не найден.' });
        res.json({ success: true, cover: { image: user.cover_image, blur: user.cover_blur, snow: !!user.cover_snow, effect: user.is_premium ? user.cover_effect : 'none', ring: user.is_premium ? user.cover_ring : 'none' } });
    } catch { res.status(500).json({ success: false, message: 'Не удалось загрузить фон.' }); }
});

router.put('/cover', async (req, res) => {
    const { image, blur, snow, effect = 'none', ring = 'none' } = req.body || {};
    if (!['none', 'aurora', 'rain'].includes(effect) || !['none', 'silver', 'iridescent'].includes(ring)) {
        return res.status(400).json({ success: false, message: 'Неизвестный стиль оформления.' });
    }
    if (!Number.isInteger(blur) || blur < 0 || blur > 20 || typeof snow !== 'boolean') {
        return res.status(400).json({ success: false, message: 'Некорректные настройки эффектов.' });
    }
    let newFile;
    try {
        const user = await dbGet('SELECT cover_image, is_premium FROM users WHERE username = ?', [req.username]);
        if (!user) return res.status(404).json({ success: false, message: 'Профиль не найден.' });
        if (!user.is_premium && (effect !== 'none' || ring !== 'none')) return res.status(403).json({ success: false, message: 'Эти эффекты доступны с Premium.' });
        let imagePath = user.cover_image;
        if (image === null) imagePath = null;
        else if (image !== undefined) {
            const match = typeof image === 'string' && image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
            if (!match || image.length > 7 * 1024 * 1024) return res.status(400).json({ success: false, message: 'Выберите JPG, PNG или WebP до 5 МБ.' });
            const bytes = Buffer.from(match[2], 'base64');
            const valid = match[1] === 'jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([255,216,255]))
                : match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
                : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
            if (!valid || bytes.length > 5 * 1024 * 1024) return res.status(400).json({ success: false, message: 'Неверный формат или размер изображения.' });
            const filename = `${crypto.randomUUID()}.${match[1]}`;
            newFile = path.join(__dirname, '../../public/uploads/covers', filename);
            await fs.writeFile(newFile, bytes, { flag: 'wx' });
            imagePath = `/uploads/covers/${filename}`;
        }
        await dbRun('UPDATE users SET cover_image = ?, cover_blur = ?, cover_snow = ?, cover_effect = ?, cover_ring = ? WHERE username = ?', [imagePath, blur, snow ? 1 : 0, effect, ring, req.username]);
        res.json({ success: true, cover: { image: imagePath, blur, snow, effect, ring } });
    } catch {
        if (newFile) await fs.unlink(newFile).catch(() => {});
        res.status(500).json({ success: false, message: 'Не удалось сохранить фон. Попробуйте ещё раз.' });
    }
});
module.exports = router;
