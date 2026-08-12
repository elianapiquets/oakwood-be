const BASE = 'http://localhost:3100';

const endpoints = [
  {method: 'GET', path: '/api/health', desc: 'Health check & product count'},
  {method: 'GET', path: '/api/products', desc: 'All products with chemistry data'},
  {method: 'GET', path: '/api/products/:sku', desc: 'Chemistry data by Shopify variant SKU'},
  {
    method: 'GET',
    path: '/api/products/by-handle/:handle',
    desc: 'Chemistry data by Shopify product handle',
  },
];

const examples = [
  '/api/products/010986',
  '/api/products/1222',
  '/api/products/by-handle/4-chlorobenzeneboronic-acid',
  '/api/products/by-handle/acetonitrile-anhydrous',
];

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 font-mono text-sm">
      <header className="bg-slate-900 text-white px-8 py-5">
        <p className="text-slate-400 text-xs mb-1">Oakwood Chemical</p>
        <h1 className="text-xl font-semibold">Custom Backend API</h1>
        <p className="text-slate-400 text-xs mt-1">
          Chemistry data service · {BASE}
        </p>
      </header>

      <main className="px-8 py-8 max-w-3xl">
        <section className="mb-8">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
            Endpoints
          </h2>
          <div className="border border-slate-200 rounded overflow-hidden">
            {endpoints.map((e, i) => (
              <div
                key={e.path}
                className={`flex items-start gap-4 px-4 py-3 ${i < endpoints.length - 1 ? 'border-b border-slate-100' : ''}`}
              >
                <span className="text-green-700 font-bold w-10 shrink-0">
                  {e.method}
                </span>
                <span className="text-slate-800 flex-1">{e.path}</span>
                <span className="text-slate-400 text-xs">{e.desc}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
            Try it
          </h2>
          <div className="flex flex-col gap-2">
            {examples.map((path) => (
              <a
                key={path}
                href={`${BASE}${path}`}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                {BASE}
                {path}
              </a>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
