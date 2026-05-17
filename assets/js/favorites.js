/* Favorites — requires FinBlasti core + API */

FinBlasti.loadFavorites = async function () {
  const token = FinBlasti.getToken();
  if (!token) {
    FinBlasti.savedSpotIds = new Set();
    return;
  }
  try {
    const rows = await FinBlasti.apiFetch('/favorites', {
      headers: FinBlasti.authHeaders(false)
    });
    FinBlasti.savedSpotIds = new Set(rows.map((r) => String(r.spot_id)));
  } catch (e) {
    console.warn('Favoris non chargés', e);
    FinBlasti.savedSpotIds = new Set();
  }
};

FinBlasti.isSaved = (spotId) => FinBlasti.savedSpotIds.has(String(spotId));

FinBlasti.toggleFavorite = async function (spotId) {
  const token = FinBlasti.getToken();
  if (!token) {
    showToast('Connexion requise', 'Connecte-toi pour enregistrer ce spot.', 'error');
    setRoute('login');
    return false;
  }
  const id = String(spotId);
  const saved = FinBlasti.isSaved(id);
  const buttons = Array.from(document.querySelectorAll(`[data-save-spot="${id}"]`));
  buttons.forEach((btn) => {
    btn.disabled = true;
    btn.classList.add('opacity-70');
  });
  try {
    await FinBlasti.apiFetch(
      saved ? `/favorites/${id}` : '/favorites',
      {
        method: saved ? 'DELETE' : 'POST',
        headers: FinBlasti.authHeaders(),
        body: saved ? undefined : JSON.stringify({ spot_id: id })
      }
    );
    if (saved) FinBlasti.savedSpotIds.delete(id);
    else FinBlasti.savedSpotIds.add(id);
    buttons.forEach((btn) => FinBlasti.updateSaveButton(btn, id));
    showToast(
      saved ? 'Retiré des favoris' : 'Spot enregistré',
      saved ? 'Ce spot a été retiré de ta liste.' : 'Tu le retrouveras dans Spots enregistrés.'
    );
    if (typeof renderSaved === 'function') renderSaved();
    return !saved;
  } catch (e) {
    showToast('Erreur', e.message || 'Impossible de modifier les favoris.', 'error');
    return saved;
  } finally {
    buttons.forEach((btn) => {
      btn.disabled = false;
      btn.classList.remove('opacity-70');
    });
  }
};

FinBlasti.updateSaveButton = function (btn, spotId) {
  if (!btn) return;
  const saved = FinBlasti.isSaved(spotId);
  btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
  btn.classList.toggle('is-saved', saved);
  const icon = btn.querySelector('i');
  if (icon) {
    icon.className = saved
      ? 'fa-solid fa-bookmark text-primary'
      : 'fa-regular fa-bookmark';
    if (btn.id === 'saveFavorite') {
      icon.className = saved ? 'fa-solid fa-bookmark mr-2' : 'fa-regular fa-bookmark mr-2';
    }
  }
  const label = btn.querySelector('span');
  if (label) label.textContent = saved ? 'Enregistré' : 'Enregistrer';
};

FinBlasti.saveButtonHtml = (spotId) => `
  <button type="button" data-save-spot="${spotId}" class="save-spot-btn w-10 h-10 rounded-full border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 flex items-center justify-center hover:border-primary transition-colors" aria-label="Enregistrer le spot">
    <i class="fa-regular fa-bookmark"></i>
  </button>
`;
