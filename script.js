// Optional: enable horizontal scrolling with mouse wheel
const rows = document.querySelectorAll('.thumbnail-row');
rows.forEach(row => {
  row.addEventListener('wheel', evt => {
    evt.preventDefault();
    row.scrollLeft += evt.deltaY;
  });
});
