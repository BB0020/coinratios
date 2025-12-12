"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { createChart, type UTCTimestamp, type ISeriesApi } from "lightweight-charts";
import ThemeToggle from "./ThemeToggle";

interface Coin { id:string; symbol:string; name:string; image:string; type:"crypto"|"fiat"; }
interface HistoryPoint { time:number; value:number; }

const USD: Coin = { id:"usd", symbol:"USD", name:"US Dollar", image:"https://flagcdn.com/us.svg", type:"fiat" };
const FIAT_LIST: Coin[] = [
  { id:"AUD",symbol:"AUD",name:"Australian Dollar",image:"https://flagcdn.com/au.svg",type:"fiat"},
  { id:"BRL",symbol:"BRL",name:"Brazilian Real",image:"https://flagcdn.com/br.svg",type:"fiat"},
  { id:"CAD",symbol:"CAD",name:"Canadian Dollar",image:"https://flagcdn.com/ca.svg",type:"fiat"},
  { id:"CHF",symbol:"CHF",name:"Swiss Franc",image:"https://flagcdn.com/ch.svg",type:"fiat"},
  { id:"CNY",symbol:"CNY",name:"Chinese Yuan",image:"https://flagcdn.com/cn.svg",type:"fiat"},
  { id:"DKK",symbol:"DKK",name:"Danish Krone",image:"https://flagcdn.com/dk.svg",type:"fiat"},
  { id:"EUR",symbol:"EUR",name:"Euro",image:"https://flagcdn.com/eu.svg",type:"fiat"},
  { id:"GBP",symbol:"GBP",name:"British Pound",image:"https://flagcdn.com/gb.svg",type:"fiat"},
  { id:"HKD",symbol:"HKD",name:"Hong Kong Dollar",image:"https://flagcdn.com/hk.svg",type:"fiat"},
  { id:"INR",symbol:"INR",name:"Indian Rupee",image:"https://flagcdn.com/in.svg",type:"fiat"},
  { id:"JPY",symbol:"JPY",name:"Japanese Yen",image:"https://flagcdn.com/jp.svg",type:"fiat"},
  { id:"KRW",symbol:"KRW",name:"South Korean Won",image:"https://flagcdn.com/kr.svg",type:"fiat"},
  { id:"MXN",symbol:"MXN",name:"Mexican Peso",image:"https://flagcdn.com/mx.svg",type:"fiat"},
  { id:"NOK",symbol:"NOK",name:"Norwegian Krone",image:"https://flagcdn.com/no.svg",type:"fiat"},
  { id:"NZD",symbol:"NZD",name:"New Zealand Dollar",image:"https://flagcdn.com/nz.svg",type:"fiat"},
  { id:"SEK",symbol:"SEK",name:"Swedish Krona",image:"https://flagcdn.com/se.svg",type:"fiat"},
  { id:"SGD",symbol:"SGD",name:"Singapore Dollar",image:"https://flagcdn.com/sg.svg",type:"fiat"},
  { id:"TRY",symbol:"TRY",name:"Turkish Lira",image:"https://flagcdn.com/tr.svg",type:"fiat"},
  { id:"ZAR",symbol:"ZAR",name:"South African Rand",image:"https://flagcdn.com/za.svg",type:"fiat"},
];

export default function Page() {
  const [allCoins,setAllCoins] = useState<Coin[]>([]);
  const [fromCoin,setFromCoin] = useState<Coin|null>(null);
  const [toCoin,setToCoin] = useState<Coin|null>(null);
  const [amount,setAmount] = useState("1");
  const [range,setRange] = useState("24H");
  const [result,setResult] = useState<number|null>(null);

  const [openDropdown,setOpenDropdown] = useState<"from"|"to"|null>(null);
  const [fromSearch,setFromSearch] = useState("");
  const [toSearch,setToSearch] = useState("");

  const chartContainerRef = useRef<HTMLDivElement|null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<ISeriesApi<"Line">|null>(null);
  const openLineRef = useRef<ISeriesApi<"Line">|null>(null);
  const tooltipRef = useRef<HTMLDivElement|null>(null);
  const badgeOpenRef = useRef<HTMLDivElement|null>(null);
  const badgeLastRef = useRef<HTMLDivElement|null>(null);

  const historyCache = useRef<Record<string,HistoryPoint[]>>({});
  const realtimeCache = useRef<Record<string,number>>({});

  useEffect(()=>{(window as any).chartRef=chartRef;(window as any).seriesRef=seriesRef;},[]);

  useEffect(()=>{
    async function loadCoins(){
      const r=await fetch("/api/coins");
      const d=await r.json();
      const cryptoList=d.coins??[];
      const final=[USD,...cryptoList,...FIAT_LIST];
      setAllCoins(final);
      const btc=final.find(c=>c.id==="bitcoin");
      setFromCoin(btc||final[1]);
      setToCoin(USD);
    }
    loadCoins();
  },[]);

  const filteredCoins=useCallback((q:string)=>{
    const s=q.toLowerCase();
    return allCoins.filter(c=>c.symbol.toLowerCase().includes(s)||c.name.toLowerCase().includes(s));
  },[allCoins]);

  const getRealtime=useCallback(async(coin:Coin)=>{
    const key=coin.id;
    if(realtimeCache.current[key]) return realtimeCache.current[key];
    const r=await fetch(`/api/price?base=${coin.id}&quote=usd`);
    const j=await r.json();
    const price=typeof j.price==="number"?j.price:0;
    realtimeCache.current[key]=price;
    return price;
  },[]);

  useEffect(()=>{
    async function compute(){
      if(!fromCoin||!toCoin) return;
      const amt=Number(amount);
      if(amt<=0) return setResult(null);
      const[a,b]=await Promise.all([getRealtime(fromCoin),getRealtime(toCoin)]);
      setResult((a/b)*amt);
    }
    const t=setTimeout(compute,100);
    return()=>clearTimeout(t);
  },[amount,fromCoin,toCoin,getRealtime]);

  const rangeToDays=(r:string)=>
    r==="24H"?1:
    r==="7D"?7:
    r==="1M"?30:
    r==="3M"?90:
    r==="6M"?180:365;

  const getHistory=useCallback(async(base:Coin,quote:Coin,days:number)=>{
    const key=`${base.id}-${quote.id}-${days}`;
    if(historyCache.current[key])return historyCache.current[key];
    const r=await fetch(`/api/history?base=${base.id}&quote=${quote.id}&days=${days}`);
    const j=await r.json();
    const cleaned = (j.history ?? [])
    .filter((p: HistoryPoint)=>Number.isFinite(p.value))
    .sort((a: HistoryPoint, b: HistoryPoint)=>a.time - b.time);

    historyCache.current[key]=cleaned;
    return cleaned;
  },[]);

  const getNormalizedHistory=useCallback(async(base:Coin,quote:Coin,days:number)=>{
    let fBase=base, fQuote=quote, invert=false;
    if(base.type==="fiat"){ fBase=quote; fQuote=base; invert=true; }
    const hist=await getHistory(fBase,fQuote,days);
    if(!invert) return hist;
    return hist.map((p: HistoryPoint) => ({
  time: p.time,
  value: p.value ? 1 / p.value : 0
}));

  },[getHistory]);

  function createTooltip():HTMLDivElement{
    const el=document.createElement("div");
    el.style.position="absolute";
    el.style.pointerEvents="none";
    el.style.zIndex="9999";
    el.style.visibility="hidden";
    el.style.padding="10px 14px";
    el.style.borderRadius="10px";
    el.style.background="rgba(255,255,255,0.96)";
    el.style.boxShadow="0 4px 12px rgba(0,0,0,0.15)";
    el.style.fontSize="13px";
    el.style.color="#111";
    el.style.whiteSpace="nowrap";
    el.style.opacity="0";
    el.style.transition="opacity .12s ease-out, transform .12s ease-out";
    return el;
  }

  function createBadge():HTMLDivElement{
    const el=document.createElement("div");
    el.style.position="absolute";
    el.style.padding="4px 10px";
    el.style.borderRadius="6px";
    el.style.fontSize="13px";
    el.style.fontWeight="600";
    el.style.color="#fff";
    el.style.boxShadow="0 3px 10px rgba(0,0,0,0.15)";
    el.style.opacity="0";
    el.style.transition="opacity .25s ease-out, transform .25s ease-out";
    return el;
  }

  const latestBuild=useRef<symbol|null>(null);

  const build=useCallback(async()=>{
    if(!fromCoin||!toCoin) return;

    const id=Symbol(); latestBuild.current=id;

    const container=chartContainerRef.current;
    if(!container)return;

    const days=rangeToDays(range);
    const hist=await getNormalizedHistory(fromCoin,toCoin,days);
    if(!hist.length)return;

    if(latestBuild.current!==id)return;

    if(chartRef.current){
      chartRef.current.remove();
      chartRef.current=null;
      seriesRef.current=null;
      openLineRef.current=null;
    }

    const isDark=document.documentElement.classList.contains("dark");

    const chart=createChart(container,{
      width:container.clientWidth,
      height:390,
      layout:{ background:{color:"transparent"}, textColor:isDark?"#e5e7eb":"#374151"},
      grid:{ vertLines:{color:"transparent"}, horzLines:{color:"transparent"}},
      rightPriceScale:{borderVisible:false},
      timeScale:{
        borderVisible:false,
        timeVisible:true,
        tickMarkFormatter:(t:UTCTimestamp)=>{
          const d=new Date((t as number)*1000);
          return range==="24H"
          ? d.toLocaleTimeString(undefined,{hour:"numeric",hour12:true})
          : d.toLocaleDateString(undefined,{month:"short",day:"numeric"});
        }
      },
      crosshair:{mode:1,vertLine:{width:1,color:"rgba(255,255,255,0.4)"},horzLine:{visible:false}}
    });

    chartRef.current=chart;

    const open = hist.length>=3 ? (hist[0].value+hist[1].value+hist[2].value)/3 : hist[0].value;

    const openLine=chart.addLineSeries({
      color:"#888",
      lineWidth:1,
      lineStyle:2
    });

    openLine.setData(hist.map((p: HistoryPoint) => ({ time: p.time, value: open })));
    openLineRef.current=openLine;

    const segments=[];
    let tmp=[hist[0]];
    for(let i=1;i<hist.length;i++){
      const prev=hist[i-1], cur=hist[i];
      const prevAbove=prev.value>=open, curAbove=cur.value>=open;
      tmp.push(cur);
      if(prevAbove!==curAbove){
        segments.push(tmp);
        tmp=[cur];
      }
    }
    if(tmp.length)segments.push(tmp);

    segments.forEach(seg=>{
      const rising=seg[0].value>=open;
      const line=chart.addLineSeries({
        color:rising?"#16c784":"#ea3943",
        lineWidth:2
      });
      line.setData(seg);
    });

    if(!tooltipRef.current){
      tooltipRef.current=createTooltip();
      container.appendChild(tooltipRef.current);
    }
    const tooltip=tooltipRef.current;

    if(!badgeOpenRef.current){
      badgeOpenRef.current=createBadge();
      badgeOpenRef.current.style.left="12px";
      badgeOpenRef.current.style.top="12px";
      container.appendChild(badgeOpenRef.current);
    }

    if(!badgeLastRef.current){
      badgeLastRef.current=createBadge();
      badgeLastRef.current.style.right="12px";
      badgeLastRef.current.style.top="12px";
      container.appendChild(badgeLastRef.current);
    }

    const openBadge=badgeOpenRef.current!;
    const lastBadge=badgeLastRef.current!;

    openBadge.textContent = open.toLocaleString(undefined,{maximumFractionDigits:8});
    openBadge.style.background="#888";
    openBadge.style.opacity="1";

    const last=hist[hist.length-1].value;
    lastBadge.textContent=last.toLocaleString(undefined,{maximumFractionDigits:8});
    lastBadge.style.background= last>=open ? "#16c784" : "#ea3943";
    lastBadge.style.opacity="1";

    chart.subscribeCrosshairMove(param => {
  if (!param.point || !param.time) {
    tooltip.style.opacity = "0";
    tooltip.style.visibility = "hidden";
    return;
  }

  let ts: Date;
  if (typeof param.time === "object") {
    const t: any = param.time;
    ts = new Date(t.year, t.month - 1, t.day);
  } else {
    const raw = Number(param.time);
    const ms = raw < 2_000_000_000 ? raw * 1000 : raw;
    ts = new Date(ms);
  }

  // Read price from main series only
  let price: number | undefined = undefined;
  if (param.seriesData && seriesRef.current) {
    price = param.seriesData.get(seriesRef.current) as number | undefined;
  }

  const dateStr = ts.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const timeStr = ts.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  tooltip.innerHTML = `
    <div style="font-size:12px; opacity:.8; margin-bottom:4px;">
      ${dateStr} — ${timeStr}
    </div>
    <div style="font-size:15px; font-weight:600;">
      ${price?.toLocaleString(undefined, { maximumFractionDigits: 8 }) ?? ""}
    </div>
  `;

  const { x, y } = param.point;
  const w = tooltip.clientWidth;
  const h = tooltip.clientHeight;

  tooltip.style.left = Math.min(Math.max(x - w / 2, 0), container.clientWidth - w) + "px";
  tooltip.style.top = (y - h - 14) + "px";
  tooltip.style.visibility = "visible";
  tooltip.style.opacity = "1";
});


    chart.timeScale().fitContent();
    window.addEventListener("resize",()=>chart.resize(container.clientWidth,390));
  },[fromCoin,toCoin,range,getNormalizedHistory]);

  useEffect(()=>{
    if(!fromCoin||!toCoin)return;
    requestAnimationFrame(()=>requestAnimationFrame(()=>build()));
  },[fromCoin,toCoin,range,build]);

  const renderRow=useCallback((coin:Coin,type:"from"|"to")=>{
    const disabled=(type==="from"&&coin.id===toCoin?.id)||(type==="to"&&coin.id===fromCoin?.id);
    const selected=(type==="from"&&coin.id===fromCoin?.id)||(type==="to"&&coin.id===toCoin?.id);
    const cls="dropdown-row"+(selected?" dropdown-selected":"")+(disabled?" dropdown-disabled":"");

    return(
      <div key={coin.id} className={cls}
        onClick={()=>{ if(disabled)return; type==="from"?setFromCoin(coin):setToCoin(coin); setOpenDropdown(null); setFromSearch(""); setToSearch("");}}>
        <img src={coin.image} className="dropdown-flag"/>
        <div><div className="dropdown-symbol">{coin.symbol}</div><div className="dropdown-name">{coin.name}</div></div>
      </div>
    );
  },[fromCoin,toCoin]);

  const renderDropdown=useCallback((type:"from"|"to")=>{
    const s=type==="from"?fromSearch:toSearch;
    const set=type==="from"?setFromSearch:setToSearch;
    return(
      <div className="dropdown-panel">
        <input className="dropdown-search" placeholder="Search..." value={s} onChange={e=>set(e.target.value)}/>
        {filteredCoins(s).map(c=>renderRow(c,type))}
      </div>
    );
  },[filteredCoins,fromSearch,toSearch,renderRow]);

  const RangeButtons=()=>(
    <div style={{textAlign:"center",marginTop:"35px"}}>
      {["24H","7D","1M","3M","6M","1Y"].map(r=>(
        <button key={r} onClick={()=>setRange(r)}
          style={{
            margin:"0 4px",padding:"8px 14px",borderRadius:"8px",
            border:"1px solid var(--card-border)",
            background:range===r?"var(--accent)":"var(--card-bg)",
            color:range===r?"#fff":"var(--text)",cursor:"pointer",fontSize:"14px"
          }}>{r}</button>
      ))}
    </div>
  );

  const renderResult=()=>{
    if(!result||!fromCoin||!toCoin)return null;
    const rate=result/Number(amount);
    return(
      <div style={{textAlign:"center",marginTop:"40px"}}>
        <div style={{fontSize:"22px",opacity:.65}}>1 {fromCoin.symbol} → {toCoin.symbol}</div>
        <div style={{fontSize:"60px",fontWeight:700,marginTop:"10px"}}>
          {result.toLocaleString(undefined,{maximumFractionDigits:8})} {toCoin.symbol}
        </div>
        <div style={{marginTop:"10px",opacity:.7}}>
          1 {fromCoin.symbol} = {rate.toLocaleString(undefined,{maximumFractionDigits:8})} {toCoin.symbol}<br/>
          1 {toCoin.symbol} = {(1/rate).toLocaleString(undefined,{maximumFractionDigits:8})} {fromCoin.symbol}
        </div>
      </div>
    );
  };

  return(
    <div style={{maxWidth:"1150px",margin:"0 auto",padding:"22px"}}>
      <div style={{textAlign:"right",marginBottom:"10px"}}><ThemeToggle/></div>

      <div style={{display:"flex",justifyContent:"center",alignItems:"flex-start",gap:"32px",flexWrap:"wrap",marginTop:"10px"}}>

        <div style={{display:"flex",flexDirection:"column"}}>
          <h3>AMOUNT</h3>
          <input value={amount} onChange={e=>{const v=e.target.value;if(v===""||/^[0-9]*\.?[0-9]*$/.test(v))setAmount(v);}}
            className="selector-box" style={{width:"260px"}}/>
          {(amount===""||Number(amount)<=0)&&(
            <div style={{color:"red",marginTop:"6px",fontSize:"14px"}}>Enter a Number Greater than 0</div>
          )}
        </div>

        <div style={{display:"flex",flexDirection:"column",position:"relative"}}>
          <h3>FROM</h3>
          <div className="selector-box" onClick={()=>{setOpenDropdown(openDropdown==="from"?null:"from");setFromSearch("");}}>
            {fromCoin&&(<><img src={fromCoin.image} className="selector-img"/><div><div className="selector-symbol">{fromCoin.symbol}</div><div className="selector-name">{fromCoin.name}</div></div></>)}
          </div>
          {openDropdown==="from"&&renderDropdown("from")}
        </div>

        <div className="swap-circle" style={{marginTop:"38px"}} onClick={()=>{if(fromCoin&&toCoin){const f=fromCoin;setFromCoin(toCoin);setToCoin(f);}}}><div className="swap-icon"/></div>

        <div style={{display:"flex",flexDirection:"column",position:"relative"}}>
          <h3>TO</h3>
          <div className="selector-box" onClick={()=>{setOpenDropdown(openDropdown==="to"?null:"to");setToSearch("");}}>
            {toCoin&&(<><img src={toCoin.image} className="selector-img"/><div><div className="selector-symbol">{toCoin.symbol}</div><div className="selector-name">{toCoin.name}</div></div></>)}
          </div>
          {openDropdown==="to"&&renderDropdown("to")}
        </div>

      </div>

      {renderResult()}
      <RangeButtons/>

      <div ref={chartContainerRef} style={{
        width:"100%",height:"400px",marginTop:"35px",
        borderRadius:"14px",border:"1px solid var(--card-border)",
        background:"var(--card-bg)",position:"relative"
      }}/>
    </div>
  );
}
