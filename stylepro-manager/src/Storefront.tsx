import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ShoppingBag, Search, Menu, X, Plus, Minus, ShoppingCart, Store, ShieldCheck, Truck } from 'lucide-react'
import { supabase } from './lib/supabase'
import './storefront.css'

type Variant = { id: string; sku: string; size: string | null; color: string | null; sale_price: number; available: number }
type Product = { id: string; name: string; description: string | null; target_audience: string; image_url: string | null; category: string | null; brand: string | null; variants: Variant[] }
type StorefrontData = { store: { id: string; name: string; currency: string }; products: Product[] }
type CartLine = { variant: Variant; product: Product; quantity: number }

export default function Storefront() {
  const storeId = window.location.pathname.split('/').filter(Boolean)[1] || ''
  const [data, setData] = useState<StorefrontData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Tout')
  const [cart, setCart] = useState<CartLine[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let alive = true
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storeId)) {
      setError('Lien boutique invalide.')
      setLoading(false)
      return
    }
    supabase.rpc('get_public_storefront', { p_store_id: storeId })
      .then(({ data: result, error: rpcError }) => {
        if (!alive) return
        if (rpcError) throw rpcError
        if (!result?.store) throw new Error('Cette boutique est introuvable ou indisponible.')
        setData(result as StorefrontData)
      })
      .catch((reason: unknown) => { if (alive) setError(reason instanceof Error ? reason.message : 'Impossible de charger la boutique.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [storeId])

  const categories = useMemo(() => ['Tout', ...Array.from(new Set((data?.products ?? []).map(p => p.category).filter((v): v is string => Boolean(v))))], [data])
  const products = useMemo(() => (data?.products ?? []).filter(p =>
    (category === 'Tout' || p.category === category) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) || (p.brand ?? '').toLowerCase().includes(search.toLowerCase()))
  ), [data, category, search])
  const total = cart.reduce((sum, line) => sum + Number(line.variant.sale_price) * line.quantity, 0)
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0)

  function add(product: Product, variant: Variant) {
    setCart(current => {
      const existing = current.find(line => line.variant.id === variant.id)
      if (existing) return current.map(line => line.variant.id === variant.id ? { ...line, quantity: Math.min(variant.available, line.quantity + 1) } : line)
      return [...current, { product, variant, quantity: 1 }]
    })
    setNotice('Article ajouté au panier')
    window.setTimeout(() => setNotice(''), 1800)
  }
  function changeQty(id: string, delta: number) {
    setCart(current => current.map(line => line.variant.id === id ? { ...line, quantity: Math.max(0, Math.min(line.variant.available, line.quantity + delta)) } : line).filter(line => line.quantity > 0))
  }
  async function shareOrder() {
    if (!customerName.trim() || !customerPhone.trim() || cart.length === 0) {
      setNotice('Renseignez votre nom, téléphone et panier.')
      return
    }
    const lines = cart.map(line => `• ${line.product.name} — ${line.variant.size || 'Taille unique'} / ${line.variant.color || 'Couleur standard'} × ${line.quantity} = ${(Number(line.variant.sale_price) * line.quantity).toLocaleString('fr-DZ')} ${data?.store.currency}`).join('\n')
    const message = `Bonjour, je souhaite commander auprès de ${data?.store.name}.\nNom : ${customerName}\nTéléphone : ${customerPhone}\n\n${lines}\n\nTotal estimé : ${total.toLocaleString('fr-DZ')} ${data?.store.currency}\nMerci de me confirmer la disponibilité et la livraison.`
    try {
      if (navigator.share) await navigator.share({ title: `Commande — ${data?.store.name}`, text: message })
      else {
        await navigator.clipboard.writeText(message)
        setNotice('Commande copiée. Collez-la dans WhatsApp pour envoyer à la boutique.')
      }
    } catch (reason) {
      if (reason instanceof Error && reason.name !== 'AbortError') setNotice('Partage indisponible sur cet appareil.')
    }
  }

  if (loading) return <main className="shop-state"><div className="shop-spinner" /><p>Préparation de la boutique…</p></main>
  if (error || !data) return <main className="shop-state"><Store size={34}/><h1>Boutique indisponible</h1><p>{error || 'Aucun contenu disponible.'}</p></main>

  return <div className="storefront">
    <div className="shop-announcement">NOUVELLE COLLECTION · Découvrez nos articles disponibles</div>
    <header className="shop-header">
      <a className="shop-brand" href="#"><span className="shop-brand-mark"><Store size={20}/></span><span>{data.store.name}<small>COLLECTION & STYLE</small></span></a>
      <nav><a href="#catalogue">Catalogue</a><a href="#about">Notre boutique</a></nav>
      <button className="shop-cart-button" onClick={() => setCartOpen(true)}><ShoppingBag size={18}/> Panier <b>{itemCount}</b></button>
    </header>
    <section className="shop-hero">
      <div className="shop-hero-copy"><span className="shop-eyebrow">STYLE • QUALITÉ • ÉLÉGANCE</span><h1>Trouvez votre<br/><em>style unique.</em></h1><p>Explorez notre sélection et choisissez vos tailles et couleurs préférées. Votre prochain coup de cœur vous attend.</p><a href="#catalogue" className="shop-primary">Explorer la collection <ArrowRight size={17}/></a><div className="shop-trust"><span><ShieldCheck size={16}/> Articles sélectionnés</span><span><Truck size={16}/> Contact direct boutique</span></div></div>
      <div className="shop-hero-art"><div className="shop-art-orbit"/><div className="shop-art-card"><ShoppingBag size={62}/><span>YOUR STYLE<br/>YOUR STORY</span></div><span className="shop-art-note">NEW<br/>SEASON</span></div>
    </section>
    <main id="catalogue" className="shop-catalogue">
      <div className="shop-section-heading"><div><span className="shop-eyebrow">LA SÉLECTION</span><h2>Nos articles</h2><p>Des pièces disponibles, prêtes à être commandées.</p></div><label className="shop-search"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un article…"/></label></div>
      <div className="shop-categories">{categories.map(item => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
      {products.length ? <div className="shop-grid">{products.map(product => <article className="shop-product" key={product.id}><div className="shop-product-image">{product.image_url ? <img src={product.image_url} alt={product.name} loading="lazy"/> : <div className="shop-no-image"><ShoppingBag size={34}/><span>{product.name}</span></div>}<span className="shop-stock-pill">Disponible</span></div><div className="shop-product-info"><div className="shop-product-overline">{product.brand || product.category || 'COLLECTION'}</div><h3>{product.name}</h3>{product.description && <p>{product.description}</p>}<div className="shop-variant-list">{product.variants.map(variant => <div className="shop-variant" key={variant.id}><div><b>{variant.size || 'Standard'}</b><span>{variant.color || 'Couleur standard'} · {variant.available} dispo.</span></div><strong>{Number(variant.sale_price).toLocaleString('fr-DZ')} {data.store.currency}</strong><button aria-label={`Ajouter ${product.name}`} onClick={() => add(product, variant)}><Plus size={17}/></button></div>)}</div></div></article>)}</div> : <div className="shop-empty">Aucun article disponible pour cette recherche.</div>}
    </main>
    <section id="about" className="shop-about"><div><span className="shop-eyebrow">VOTRE BOUTIQUE EN LIGNE</span><h2>Un choix simple.<br/><em>Un style qui vous ressemble.</em></h2></div><p>Choisissez vos articles, tailles et couleurs, puis envoyez votre demande à la boutique. La disponibilité finale et les modalités de livraison seront confirmées directement par notre équipe.</p></section>
    <footer className="shop-footer"><a className="shop-brand" href="#"><span className="shop-brand-mark"><Store size={18}/></span><span>{data.store.name}<small>MERCI POUR VOTRE VISITE</small></span></a><span>© {new Date().getFullYear()} {data.store.name}. Tous droits réservés.</span><span>Powered by StylePro Manager</span></footer>
    {notice && <div className="shop-toast">{notice}</div>}
    {cartOpen && <div className="shop-drawer-backdrop" onClick={() => setCartOpen(false)}><aside className="shop-drawer" onClick={e => e.stopPropagation()}><div className="shop-drawer-head"><div><span className="shop-eyebrow">VOTRE SÉLECTION</span><h2>Mon panier ({itemCount})</h2></div><button onClick={() => setCartOpen(false)}><X/></button></div>{cart.length ? <><div className="shop-cart-lines">{cart.map(line => <div className="shop-cart-line" key={line.variant.id}><div><b>{line.product.name}</b><span>{line.variant.size || 'Standard'} · {line.variant.color || '—'}</span><strong>{(Number(line.variant.sale_price) * line.quantity).toLocaleString('fr-DZ')} {data.store.currency}</strong></div><div className="shop-qty"><button onClick={() => changeQty(line.variant.id, -1)}><Minus size={14}/></button><b>{line.quantity}</b><button onClick={() => changeQty(line.variant.id, 1)}><Plus size={14}/></button></div></div>)}</div><div className="shop-checkout"><label>Votre nom<input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nom et prénom"/></label><label>Téléphone<input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="05 / 06 / 07…" inputMode="tel"/></label><div className="shop-total"><span>Total estimé</span><strong>{total.toLocaleString('fr-DZ')} {data.store.currency}</strong></div><button className="shop-primary shop-submit" onClick={() => void shareOrder()}>Envoyer ma demande <ArrowRight size={17}/></button><small>La commande sera partagée depuis votre appareil. Elle n'est pas confirmée tant que la boutique ne vous a pas répondu.</small></div></> : <div className="shop-empty">Votre panier est vide.</div>}</aside></div>}
  </div>
}
