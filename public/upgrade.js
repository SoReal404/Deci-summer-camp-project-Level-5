(() => {
  const markdown = value => value.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
  const install = () => {
    const oldExplain = window.explain;
    if (!oldExplain || oldExplain.__enhanced) return;
    async function enhancedExplain(id) {
      await oldExplain(id);
      const box = document.getElementById('explain-' + id);
      if (!box) return;
      box.innerHTML = box.innerHTML.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
    }
    enhancedExplain.__enhanced = true;
    window.explain = enhancedExplain;
  };
  install();
  new MutationObserver(install).observe(document.body, { childList: true, subtree: true });
})();
