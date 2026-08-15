// ==================== UI HELPERS ====================
// The original file repeated this exact pattern on ~20 buttons:
//   const orig = btn.textContent; btn.textContent = '...'; btn.disabled = true;
//   try { ... } catch (e) { toast('error') } finally { btn.textContent = orig; btn.disabled = false; }
// withLoading() replaces all of that with one call.
export async function withLoading(btn, loadingText, fn, { onError } = {}) {
    if (!btn) return fn();
    const original = btn.textContent;
    btn.textContent = loadingText;
    btn.disabled = true;
    try {
        return await fn();
    } catch (e) {
        console.error(e);
        if (onError) onError(e);
        throw e;
    } finally {
        btn.textContent = original;
        btn.disabled = false;
    }
}
