// A tiny client-side router: the page is chosen from the URL in the browser.
const routes = {
    '/': () => '<h1>Home</h1><p>This single-page app is served by CloudFrontize.</p>',
    '/settings': () => '<h1>Settings</h1><p>Deep links work: reload this page.</p>',
};

function render() {
    const path = location.pathname;
    const user = path.match(/^\/users\/(\w+)$/);
    const view = routes[path] ?? (user ? () => `<h1>User ${user[1]}</h1>` : () => '<h1>Not found</h1>');
    document.getElementById('app').innerHTML = view();
}

document.addEventListener('click', e => {
    const link = e.target.closest('a');
    if (link && link.origin === location.origin) {
        e.preventDefault();
        history.pushState(null, '', link.pathname);
        render();
    }
});
window.addEventListener('popstate', render);
render();
