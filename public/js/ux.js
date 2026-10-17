function showToast(message) {
    let host = document.getElementById('app-notices');
    if (!host) {
        host = document.createElement('div'); host.id = 'app-notices';
        host.setAttribute('role', 'status'); document.body.append(host);
    }
    const notice = document.createElement('div'); notice.className = 'app-notice';
    notice.textContent = String(message); host.append(notice);
    while (host.children.length > 3) host.firstChild.remove();
    setTimeout(() => notice.remove(), 6000);
}

function appDialog({title, description, value, label, action}) {
    return new Promise(resolve => {
        const previous = document.activeElement;
        const layer = document.createElement('div'); layer.className = 'app-dialog-layer';
        layer.innerHTML = '<form class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title"><div class="dialog-symbol">✦</div><h3 id="app-dialog-title"></h3><p></p><label></label><input maxlength="80" required autocomplete="off"><div class="dialog-actions"><button type="button" class="modal-btn transparent">Отмена</button><button type="submit" class="modal-btn primary"></button></div></form>';
        layer.querySelector('h3').textContent = title;
        layer.querySelector('p').textContent = description;
        const input = layer.querySelector('input');
        const fieldLabel = layer.querySelector('label');
        input.id = 'app-dialog-input'; fieldLabel.htmlFor = input.id; fieldLabel.textContent = label || '';
        const editing = value !== undefined; input.hidden = fieldLabel.hidden = !editing; input.required = editing;
        input.value = value || ''; layer.querySelector('[type=submit]').textContent = action;
        const finish = result => { layer.remove(); previous?.focus({preventScroll:true}); resolve(result); };
        layer.querySelector('[type=button]').onclick = () => finish(null);
        layer.onclick = e => { if (e.target === layer) finish(null); };
        layer.querySelector('form').onsubmit = e => {
            e.preventDefault(); if (editing && !input.value.trim()) { input.setCustomValidity('Введите имя контакта'); input.reportValidity(); return; }
            finish(editing ? input.value.trim() : true);
        };
        input.oninput = () => input.setCustomValidity('');
        layer.onkeydown = e => {
            if (e.key === 'Escape') { e.stopPropagation(); finish(null); }
            if (e.key === 'Tab') {
                const fields = [...layer.querySelectorAll('input,button')].filter(el => !el.hidden);
                const first = fields[0], last = fields.at(-1);
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        };
        document.body.append(layer); (editing ? input : layer.querySelector('[type=button]')).focus();
        if (editing) input.select();
    });
}
