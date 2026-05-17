/* Comments per spot */

FinBlasti.fetchComments = async function (spotId) {
  const key = String(spotId);
  try {
    const res = await fetch(`${API_URL}/comments?spot_id=${encodeURIComponent(key)}`);
    if (!res.ok) return [];
    const data = await res.json();
    FinBlasti.commentsBySpot[key] = Array.isArray(data) ? data : [];
    return FinBlasti.commentsBySpot[key];
  } catch (e) {
    console.warn('Commentaires indisponibles', e);
    return FinBlasti.commentsBySpot[key] || [];
  }
};

FinBlasti.renderCommentsList = function (comments) {
  if (!comments.length) {
    return `<p class="text-sm text-slate-500 dark:text-slate-400 py-4">Aucun commentaire pour l'instant. Sois le premier à partager ton expérience.</p>`;
  }
  return comments
    .map(
      (c) => `
    <article class="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-4">
      <div class="flex justify-between gap-2 items-start">
        <p class="font-bold text-slate-900 dark:text-white">${FinBlasti.escapeHtml(c.user_name || 'Utilisateur')}</p>
        <time class="text-xs text-slate-400 shrink-0">${FinBlasti.formatDate(c.created_at)}</time>
      </div>
      <p class="text-slate-600 dark:text-slate-300 mt-2 text-sm leading-relaxed">${FinBlasti.escapeHtml(c.text)}</p>
    </article>
  `
    )
    .join('');
};

FinBlasti.commentsSectionHtml = function (spotId) {
  const loggedIn = Boolean(FinBlasti.getToken());
  return `
    <section class="mt-10" id="commentsSection" data-spot-id="${spotId}">
      <h2 class="text-2xl font-extrabold text-slate-900 dark:text-white mb-4">Commentaires</h2>
      <div id="commentsList" class="space-y-3 mb-6">Chargement…</div>
      ${
        loggedIn
          ? `<form id="commentForm" class="space-y-3">
        <textarea id="commentText" maxlength="500" rows="3" placeholder="Partage ton expérience (Wi-Fi, prises, ambiance)…" class="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-3 outline-none focus:border-primary text-base"></textarea>
        <p class="text-xs text-slate-400">Max 500 caractères</p>
        <button type="submit" class="rounded-full bg-primary text-white px-6 py-3 font-bold hover:bg-primaryHover">Publier le commentaire</button>
      </form>`
          : `<p class="text-sm text-slate-500 dark:text-slate-400">Connecte-toi pour laisser un commentaire visible par tous.</p>
         <button type="button" data-route="login" class="mt-2 text-primary font-bold">Se connecter</button>`
      }
    </section>
  `;
};

FinBlasti.bindCommentsSection = async function (spotId) {
  const list = document.getElementById('commentsList');
  if (!list) return;
  const comments = await FinBlasti.fetchComments(spotId);
  list.innerHTML = FinBlasti.renderCommentsList(comments);

  const form = document.getElementById('commentForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = document.getElementById('commentText')?.value?.trim() || '';
    if (!text) {
      showToast('Commentaire vide', 'Écris quelque chose avant de publier.', 'error');
      return;
    }
    if (text.length > 500) {
      showToast('Trop long', 'Le commentaire doit faire 500 caractères maximum.', 'error');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/comments`, {
        method: 'POST',
        headers: FinBlasti.authHeaders(),
        body: JSON.stringify({ spot_id: spotId, text })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur publication');
      document.getElementById('commentText').value = '';
      showToast('Commentaire publié', 'Merci pour ton retour à la communauté.');
      await FinBlasti.fetchComments(spotId);
      list.innerHTML = FinBlasti.renderCommentsList(FinBlasti.commentsBySpot[String(spotId)]);
      FinBlasti.forceVisible(list);
    } catch (err) {
      showToast('Erreur', err.message, 'error');
    }
  });
};
