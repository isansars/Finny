// Icon keys (stored on categories, guessed by category-look.ts) → Lucide line icons, Apple-style.
import {
  Coffee, Cigarette, Cookie, Utensils, Fuel, Car, Bus, Plane, Clapperboard, Music, Zap, Droplet, Wifi, Smartphone, ShoppingCart, House, Laptop, Shirt,
  HeartPulse, GraduationCap, Baby, PawPrint, Gift, HandHeart, Percent, HandCoins, Landmark, Wallet, ShieldCheck, PiggyBank, Gem, TrendingUp, ChartPie,
  Bitcoin, Briefcase, Users, Sparkles, Shapes, Receipt, Banknote, CreditCard, Repeat, ArrowLeftRight, type LucideIcon,
} from "lucide-react";
import { lookOf } from "@/lib/category-look";

export const ICONS: Record<string, LucideIcon> = {
  coffee: Coffee, cigarette: Cigarette, cookie: Cookie, utensils: Utensils, fuel: Fuel, car: Car, bus: Bus, plane: Plane, clapperboard: Clapperboard, music: Music,
  zap: Zap, droplet: Droplet, wifi: Wifi, smartphone: Smartphone, "shopping-cart": ShoppingCart, home: House, laptop: Laptop, shirt: Shirt, "heart-pulse": HeartPulse,
  "graduation-cap": GraduationCap, baby: Baby, "paw-print": PawPrint, gift: Gift, "hand-heart": HandHeart, percent: Percent, "hand-coins": HandCoins, landmark: Landmark,
  wallet: Wallet, "shield-check": ShieldCheck, "piggy-bank": PiggyBank, gem: Gem, "trending-up": TrendingUp, "pie-chart": ChartPie, bitcoin: Bitcoin, briefcase: Briefcase,
  users: Users, sparkles: Sparkles, shapes: Shapes, receipt: Receipt, banknote: Banknote, "credit-card": CreditCard, repeat: Repeat, "arrow-left-right": ArrowLeftRight,
};
export const ICON_KEYS = Object.keys(ICONS);

/** An Apple-Settings-style tile: the icon on a soft pastel square in the category's colour. */
export function Tile({ icon, color, size = 32, title }: { icon: string; color: string; size?: number; title?: string }) {
  const I = ICONS[icon] ?? Receipt;
  return <span className="fy-tile" data-color={color} style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }} title={title} aria-hidden={title ? undefined : true}><I size={Math.round(size * 0.55)} strokeWidth={2} /></span>;
}
export function CatTile({ c, size }: { c: { name: string; kind: string; icon?: string | null; color?: string | null }; size?: number }) {
  const l = lookOf(c); return <Tile icon={l.icon} color={l.color} size={size} />;
}
