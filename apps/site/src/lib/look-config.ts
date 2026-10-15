/**
 * The look's constants, in a plain module (no "use client") so the server layout can read them. Values exported from a client module
 * are not available to server components, which is how the first version of this lost the default look and the pre-paint script.
 */
export type Theme = "paper" | "basic" | "glass" | "metro";
export type Mode = "dark" | "light";
export interface Look { theme: Theme; mode: Mode; accent: string }

/** The looks the app has, which a visitor can try on this page. The site's own ("paper") is what you get when none of these is chosen. */
export const THEMES: { id: Exclude<Theme, "paper">; name: string; blurb: string }[] = [
  { id: "basic", name: "Basic", blurb: "Neutral grey surfaces and thin borders" },
  { id: "glass", name: "Glass", blurb: "Frosted panels over soft colour" },
  { id: "metro", name: "Metro", blurb: "Solid tiles and square corners" },
];

/** What a first-time visitor sees. Paper is this site's own look; the app has Basic, Glass and Metro. */
export const DEFAULT_LOOK: Look = { theme: "paper", mode: "light", accent: "hex-ff4d1f" };
export const LOOK_KEY = "jk-site-look";
/** The looks that set `flat` in their manifest (in each theme kit's package.json): the page carries `data-flat` while one is in use. */
export const FLAT_THEMES: Theme[] = ["metro"];

/**
 * Runs before the first paint (see app/layout.tsx), so a returning visitor never sees the default look flash.
 * Plain JS in a string because it cannot wait for React.
 */
export const LOOK_SCRIPT = `(function(){try{var l=JSON.parse(localStorage.getItem(${JSON.stringify(LOOK_KEY)})||"null");if(!l)return;var h=document.documentElement;
if(["paper","basic","glass","metro"].indexOf(l.theme)>-1){h.dataset.theme=l.theme;if(l.theme==="metro")h.setAttribute("data-flat","")}if(l.mode==="dark"||l.mode==="light")h.dataset.mode=l.mode;
var a=String(l.accent||"");if(a==="ink"){h.dataset.accent=a;var d=h.dataset.mode==="dark";h.style.setProperty("--accent",d?"#f4ecde":"#1a1510");h.style.setProperty("--accent-fg",d?"#1a1510":"#f4ecde");h.style.setProperty("--accent-rgb",d?"244 236 222":"26 21 16")}else if(/^(blue|teal|green|orange|pink|purple)$/.test(a)){h.dataset.accent=a}else{var m=/^hex-([0-9a-f]{6})$/.exec(a);if(m){var n=parseInt(m[1],16),r=n>>16,g=(n>>8)&255,b=n&255,f=function(c){c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4)};
var d2=h.dataset.mode==="dark";if(Math.max(r,g,b)-Math.min(r,g,b)<=16){h.dataset.accent=a;h.style.setProperty("--accent",d2?"#f4ecde":"#1a1510");h.style.setProperty("--accent-fg",d2?"#1a1510":"#f4ecde");h.style.setProperty("--accent-rgb",d2?"244 236 222":"26 21 16");return}var R=r/255,G=g/255,B=b/255,mx=Math.max(R,G,B),mn=Math.min(R,G,B),dd=mx-mn,H=0;if(dd)H=mx===R?((G-B)/dd)%6:mx===G?(B-R)/dd+2:(R-G)/dd+4;H=(H*60+360)%360;var L=(mx+mn)/2,S=dd?dd/(1-Math.abs(2*L-1)):0,bgl=d2?0.006:0.80;
var rgbAt=function(l){var c=(1-Math.abs(2*l-1))*S,x=c*(1-Math.abs(((H/60)%2)-1)),mm=l-c/2,q=H<60?[c,x,0]:H<120?[x,c,0]:H<180?[0,c,x]:H<240?[0,x,c]:H<300?[x,0,c]:[c,0,x];return[Math.round((q[0]+mm)*255),Math.round((q[1]+mm)*255),Math.round((q[2]+mm)*255)]};
var cr=function(l){var q=rgbAt(l),y=0.2126*f(q[0])+0.7152*f(q[1])+0.0722*f(q[2]);return(Math.max(y,bgl)+0.05)/(Math.min(y,bgl)+0.05)};
for(var i=0;i<100&&cr(L)<2.2;i++)L=Math.min(1,Math.max(0,L+(d2?0.01:-0.01)));
var q=rgbAt(L);r=q[0];g=q[1];b=q[2];var lum=0.2126*f(r)+0.7152*f(g)+0.0722*f(b),hx="#"+q.map(function(v){return("0"+v.toString(16)).slice(-2)}).join("");h.dataset.accent=a;h.style.setProperty("--accent",hx);h.style.setProperty("--accent-fg",lum>0.2?"#1a1510":"#ffffff");h.style.setProperty("--accent-rgb",r+" "+g+" "+b)}}}catch(e){}})();`;

