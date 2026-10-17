let coverDraft = null;
let coverEditorVersion = 0;

async function coverRequest(url, options = {}) {
    const response = await fetch(SERVER_URL + url, {
        ...options,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('monochrome_token') },
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Не удалось обновить фон.');
    return result.cover;
}

function renderProfileCover(element, cover = {}) {
    if (!element) return;
    element.classList.add('custom-profile-cover');
    let layer = element.querySelector('.profile-cover-layer');
    if (!layer) {
        layer = document.createElement('div');
        layer.className = 'profile-cover-layer';
        layer.setAttribute('aria-hidden', 'true');
        const photo = document.createElement('img');
        photo.className = 'profile-cover-photo';
        photo.alt = '';
        const shade = document.createElement('div');
        shade.className = 'profile-cover-shade';
        const snow = document.createElement('div');
        snow.className = 'profile-cover-snow';
        for (let i = 0; i < 22; i++) {
            const flake = document.createElement('i');
            flake.style.left = `${(i * 47) % 100}%`;
            flake.style.setProperty('--snow-duration', `${6 + i % 7}s`);
            flake.style.setProperty('--snow-delay', `${-i * 1.7}s`);
            flake.style.setProperty('--snow-size', `${2 + i % 3}px`);
            snow.appendChild(flake);
        }
        layer.append(photo, shade, snow);
        const effectLayer = document.createElement('div');
        effectLayer.className = 'profile-cover-effect';
        layer.append(effectLayer);
        element.prepend(layer);
    }
    const photo = layer.querySelector('img');
    const source = cover.image ? getFullUrl(cover.image) : '';
    if (source && photo.getAttribute('src') !== source) photo.src = source;
    if (!source) photo.removeAttribute('src');
    photo.hidden = !source;
    element.classList.toggle('has-cover-photo', !!source);
    element.classList.toggle('has-cover-snow', !!cover.snow);
    element.dataset.effect = ['aurora', 'rain'].includes(cover.effect) ? cover.effect : 'none';
    element.dataset.ring = ['silver', 'iridescent'].includes(cover.ring) ? cover.ring : 'none';
    element.style.setProperty('--cover-blur', `${Number(cover.blur) || 0}px`);
}

async function loadProfileCover(element, username) {
    const requestId = String(Math.random());
    element.dataset.coverRequest = requestId;
    renderProfileCover(element);
    try {
        const cover = await coverRequest(`/api/profile/${encodeURIComponent(username)}/cover`);
        if (element.dataset.coverRequest === requestId) renderProfileCover(element, cover);
    } catch (error) { console.warn('Profile cover:', error.message); }
}

async function openCoverEditor() {
    const version = ++coverEditorVersion;
    coverDraft = null;
    const modal = document.getElementById('cover-editor');
    document.getElementById('cover-feedback').textContent = 'Загружаем настройки…';
    document.getElementById('cover-controls').disabled = true;
    document.getElementById('cover-save').textContent = 'Сохранить фон';
    document.getElementById('cover-file').value = '';
    document.getElementById('cover-preview-name').textContent = currentUser.display_name;
    document.getElementById('cover-preview-avatar').innerHTML = renderAvatarHTML(currentUser.avatar, currentUser.display_name, 'tg-profile-avatar');
    renderProfileCover(document.getElementById('cover-preview'));
    modal.classList.add('active');
    try {
        const cover = await coverRequest(`/api/profile/${encodeURIComponent(currentUser.username)}/cover`);
        if (version !== coverEditorVersion) return;
        coverDraft = { ...cover, upload: undefined };
        document.getElementById('cover-blur').value = cover.blur;
        document.getElementById('cover-snow').checked = cover.snow;
        for (const key of ['effect', 'ring']) {
            document.getElementById('cover-' + key).value = cover[key] || 'none';
            document.getElementById('cover-' + key).disabled = !isPremium;
        }
        document.getElementById('cover-premium-hint').textContent = isPremium ? 'Видно всем, кто открывает ваш профиль' : 'Доступно с Premium · подключение в настройках профиля';
        document.getElementById('cover-controls').disabled = false;
        document.getElementById('cover-feedback').textContent = 'JPG, PNG или WebP · до 5 МБ';
        updateCoverPreview();
    } catch (error) {
        if (version === coverEditorVersion) document.getElementById('cover-feedback').textContent = error.message;
    }
}

function updateCoverPreview() {
    if (!coverDraft) return;
    coverDraft.blur = Number(document.getElementById('cover-blur').value);
    coverDraft.snow = document.getElementById('cover-snow').checked;
    coverDraft.effect = document.getElementById('cover-effect').value;
    coverDraft.ring = document.getElementById('cover-ring').value;
    document.getElementById('cover-blur-value').textContent = coverDraft.blur === 0 ? 'Выкл.' : coverDraft.blur;
    document.getElementById('cover-remove').disabled = !coverDraft.image;
    renderProfileCover(document.getElementById('cover-preview'), coverDraft);
}

async function chooseCoverPhoto(input) {
    const file = input.files[0];
    input.value = '';
    if (!file || !coverDraft) return;
    const version = coverEditorVersion;
    const feedback = document.getElementById('cover-feedback');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
        feedback.textContent = 'Выберите JPG, PNG или WebP размером до 5 МБ.';
        return;
    }
    document.getElementById('cover-controls').disabled = true;
    feedback.textContent = 'Подготавливаем фото…';
    let bitmap;
    try {
        bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        if (version !== coverEditorVersion) return;
        coverDraft.image = coverDraft.upload = canvas.toDataURL('image/jpeg', .88);
        updateCoverPreview();
        feedback.textContent = 'Предпросмотр готов. Нажмите «Сохранить фон».';
    } catch {
        if (version === coverEditorVersion) feedback.textContent = 'Не удалось открыть изображение. Попробуйте другое фото.';
    } finally {
        bitmap?.close();
        if (version === coverEditorVersion) document.getElementById('cover-controls').disabled = false;
    }
}

function removeCoverPhoto() {
    if (!coverDraft) return;
    coverDraft.image = coverDraft.upload = null;
    updateCoverPreview();
}

async function saveProfileCover() {
    if (!coverDraft || document.getElementById('cover-controls').disabled) return;
    const version = coverEditorVersion;
    document.getElementById('cover-controls').disabled = true;
    document.getElementById('cover-save').textContent = 'Сохраняем…';
    try {
        const cover = await coverRequest('/api/profile/cover', { method: 'PUT', body: JSON.stringify({ image: coverDraft.upload, blur: coverDraft.blur, snow: coverDraft.snow, effect: coverDraft.effect, ring: coverDraft.ring }) });
        const panel = document.querySelector('#my-profile-view .tg-profile-cover');
        panel.dataset.coverRequest = '';
        renderProfileCover(panel, cover);
        if (version === coverEditorVersion) closeCoverEditor();
    } catch (error) {
        if (version === coverEditorVersion) document.getElementById('cover-feedback').textContent = error.message;
    } finally {
        if (version === coverEditorVersion) {
            document.getElementById('cover-controls').disabled = false;
            document.getElementById('cover-save').textContent = 'Сохранить фон';
        }
    }
}

function closeCoverEditor(returnFocus = true) {
    ++coverEditorVersion;
    coverDraft = null;
    document.getElementById('cover-editor').classList.remove('active');
    if (returnFocus) document.querySelector('.cover-edit-button').focus();
}
