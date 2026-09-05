document.querySelector('[data-print]')?.addEventListener('click', () => window.print());

for (const link of document.querySelectorAll('.markdown-body a[href]')) {
  link.dataset.printHref = link.href;
}
