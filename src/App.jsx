import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { RefreshCcw, DollarSign, Target, Scale, Zap, Newspaper, Save, Clock, TrendingUp, TrendingDown, MinusCircle, CheckCircle, Database, Trash2, Settings, Activity, CornerDownLeft, BarChart3, TrendingUpIcon, TrendingDownIcon } from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar
} from 'recharts';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, addDoc, onSnapshot, updateDoc, collection, query, serverTimestamp, deleteDoc, setDoc } from 'firebase/firestore';

// --- Global Constants for APIs ---
const API_KEY = ""; // Canvas will inject the key.
const API_MODEL = "gemini-2.5-flash-preview-09-2025";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${API_MODEL}:generateContent?key=${API_KEY}`;

// --- Firebase Initialization Vars (Provided by Canvas) ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Define the structure for a trade entry
const createTradeEntry = (maxShares, totalRiskAmount, totalCost, netRisk, netGain, entryPrice, atrStopDistance, ticker, sentiment, targetRMultiple) => ({
  maxShares,
  totalRiskAmount,
  totalCost, 
  netRisk,   
  netGain,   
  entryPrice,
  atrStopDistance,
  targetRMultiple, 
  ticker,
  sentimentText: sentiment?.text || 'N/A',
  result: 'Pending', 
  timestamp: serverTimestamp(),
});

// --- Fallback Defaults ---
const FALLBACK_ACCOUNT_SIZE = 10000;
const FALLBACK_RISK_PERCENT = 1.0;
const FALLBACK_R_MULTIPLE = 2.0;
const FALLBACK_ENTRY_PRICE = 150.00;
const FALLBACK_ATR_STOP = 4.50;
const FALLBACK_TRADE_COST = 5.00; 

// Main App Component
const App = () => {
  // --- FIREBASE STATE ---
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [dbError, setDbError] = useState('');

  // --- PERSISTENT SETTINGS STATE ---
  const [defaultSettings, setDefaultSettings] = useState(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [settingsMessage, setSettingsMessage] = useState('');
  
  // --- Risk Calculator State (Initialized with fallbacks) ---
  const [accountSize, setAccountSize] = useState(FALLBACK_ACCOUNT_SIZE); 
  const [riskPercent, setRiskPercent] = useState(FALLBACK_RISK_PERCENT); 
  const [entryPrice, setEntryPrice] = useState(FALLBACK_ENTRY_PRICE); 
  const [atrStopDistance, setAtrStopDistance] = useState(FALLBACK_ATR_STOP); 
  const [targetRMultiple, setTargetRMultiple] = useState(FALLBACK_R_MULTIPLE); 
  const [totalTradeCost, setTotalTradeCost] = useState(FALLBACK_TRADE_COST); 
  const [calcResultMessage, setCalcResultMessage] = useState('');

  // --- News Advisor State ---
  const [ticker, setTicker] = useState('QQQ');
  const [newsAnalysis, setNewsAnalysis] = useState(null);
  const [loadingNews, setLoadingNews] = useState(false);
  const [newsError, setNewsError] = useState('');
  
  // --- Trade Journal State ---
  const [tradeHistory, setTradeHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [updateStatus, setUpdateStatus] = useState({}); 

  // Derived Firestore path for user settings
  const settingsDocPath = useMemo(() => 
    userId ? `artifacts/${appId}/users/${userId}/settings/user_preferences` : null, 
    [userId]
  );

  // --- 1. FIREBASE INITIALIZATION & AUTHENTICATION ---
  useEffect(() => {
    try {
      if (Object.keys(firebaseConfig).length === 0) {
        setDbError('Firebase configuration is missing. Journaling and persistence disabled.');
        return;
      }
      
      const app = initializeApp(firebaseConfig);
      const authInstance = getAuth(app);
      const dbInstance = getFirestore(app);
      
      setAuth(authInstance);
      setDb(dbInstance);

      const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
        if (!user) {
          if (initialAuthToken) {
            await signInWithCustomToken(authInstance, initialAuthToken);
          } else {
            await signInAnonymously(authInstance);
          }
        }
        setUserId(authInstance.currentUser?.uid || crypto.randomUUID());
        setIsAuthReady(true);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Firebase setup error:", error);
      setDbError(`Firebase setup failed: ${error.message}`);
    }
  }, []);

  // --- 2. FIREBASE LOAD PERSISTENT USER SETTINGS ---
  useEffect(() => {
    if (!db || !userId || !isAuthReady || !settingsDocPath) return;

    const docRef = doc(db, settingsDocPath);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            const loadedSettings = docSnap.data();
            setDefaultSettings(loadedSettings);

            setAccountSize(loadedSettings.accountSize || FALLBACK_ACCOUNT_SIZE);
            setRiskPercent(loadedSettings.riskPercent || FALLBACK_RISK_PERCENT);
            setTargetRMultiple(loadedSettings.targetRMultiple || FALLBACK_R_MULTIPLE);
            setTotalTradeCost(loadedSettings.totalTradeCost || FALLBACK_TRADE_COST);
        } else {
            setDefaultSettings(null);
        }
        setLoadingSettings(false);
    }, (error) => {
        console.error("Error loading default settings:", error);
        setSettingsMessage('Failed to load default settings.');
        setLoadingSettings(false);
    });

    return () => unsubscribe();
  }, [db, userId, isAuthReady, settingsDocPath]);


  // --- 3. FIREBASE SAVE DEFAULT SETTINGS ---
  const saveDefaultSettings = useCallback(async () => {
    if (!db || !userId || !isAuthReady || !settingsDocPath) {
        setSettingsMessage('Error: Database not ready.');
        return;
    }
    setSettingsMessage('Saving defaults...');

    try {
        const settingsData = {
            accountSize: accountSize,
            riskPercent: riskPercent,
            targetRMultiple: targetRMultiple,
            totalTradeCost: totalTradeCost, 
            updatedAt: serverTimestamp(),
        };

        const docRef = doc(db, settingsDocPath);
        await setDoc(docRef, settingsData, { merge: true });

        setSettingsMessage('Current inputs saved as default settings!');
    } catch (error) {
        console.error("Error saving settings: ", error);
        setSettingsMessage(`Error saving defaults: ${error.message}`);
    } finally {
        setTimeout(() => setSettingsMessage(''), 5000);
    }
  }, [db, userId, isAuthReady, accountSize, riskPercent, targetRMultiple, totalTradeCost, settingsDocPath]);


  // --- 4. FIREBASE REAL-TIME DATA LISTENER (Trade History) ---
  useEffect(() => {
    if (!db || !userId || !isAuthReady) return;

    const journalCollectionPath = `artifacts/${appId}/users/${userId}/trade_journal`;
    const q = query(collection(db, journalCollectionPath));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const history = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : new Date(),
      })).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()); 
      
      setTradeHistory(history.reverse());
    }, (error) => {
      console.error("Firestore listener failed:", error);
      setDbError('Failed to load trade history. Check console for details.');
    });

    return () => unsubscribe();
  }, [db, userId, isAuthReady]);

  // --- Core Calculation Logic (Fixed Fractional Sizing, R-Multiples, and Costs) ---
  const { maxShares, totalRiskAmount, stopPrice, targetRPrice, potentialGain, totalCost, netRisk, netGain } = useMemo(() => {
    let shares = 0;
    let riskAmt = 0;
    let stopP = 0;
    let targetRPrice = 0;
    let potentialGain = 0;
    
    const totalCost = totalTradeCost; 
    let netRisk = 0;
    let netGain = 0;

    try {
      const riskFraction = riskPercent / 100;
      riskAmt = accountSize * riskFraction;

      if (atrStopDistance > 0 && riskAmt > 0) {
        shares = Math.floor(riskAmt / atrStopDistance);
      }
      
      if (shares > 0) {
        const actualDollarRisk = shares * atrStopDistance;
        riskAmt = actualDollarRisk;
        
        stopP = entryPrice - atrStopDistance;
        
        potentialGain = actualDollarRisk * targetRMultiple; 
        
        targetRPrice = entryPrice + (atrStopDistance * targetRMultiple); 
        
        netRisk = actualDollarRisk + totalCost; // Gross Risk + Cost
        netGain = potentialGain - totalCost; // Gross Gain - Cost

      } else {
        riskAmt = accountSize * riskFraction;
        netRisk = riskAmt + totalCost;
        netGain = 0 - totalCost;
      }

    } catch (e) {
      console.error("Calculation error:", e);
    }
    
    return { 
      maxShares: shares < 0 ? 0 : shares, 
      totalRiskAmount: riskAmt < 0 ? 0 : riskAmt,
      stopPrice: stopP < 0 ? 0 : stopP, 
      targetRPrice: targetRPrice,
      potentialGain: potentialGain < 0 ? 0 : potentialGain,
      totalCost,
      netRisk,
      netGain,
    };
  }, [accountSize, riskPercent, atrStopDistance, entryPrice, targetRMultiple, totalTradeCost]); 

  // --- Equity Curve Data Calculation ---
  const equityCurveData = useMemo(() => {
    if (!tradeHistory || tradeHistory.length === 0) return [];

    let currentEquity = accountSize; 
    let highWaterMark = accountSize; 
    let maxDrawdownDollar = 0; 
    
    let curve = [{ 
      tradeNumber: 0, 
      equity: accountSize, 
      type: 'Start', 
      gain: 0, 
      highWaterMark: accountSize 
    }];

    const chronologicalTrades = [...tradeHistory].reverse(); 

    chronologicalTrades.forEach((trade, index) => {
      let realizedGainLoss = 0;
      const tradeNumber = index + 1;

      // Ensure we use the stored values from the journal
      const grossRisk = trade.totalRiskAmount || 0;
      const grossGain = grossRisk * (trade.targetRMultiple || 0);
      const totalCostValue = trade.totalCost || 0;

      if (trade.result === 'Win') {
        realizedGainLoss = grossGain - totalCostValue;
      } else if (trade.result === 'Loss') {
        realizedGainLoss = -(grossRisk + totalCostValue);
      } else if (trade.result === 'Scratch') {
        realizedGainLoss = -totalCostValue; // Only lose the cost on a scratch trade
      } 
      
      if (trade.result !== 'Pending') {
        currentEquity += realizedGainLoss;
        
        if (currentEquity > highWaterMark) {
            highWaterMark = currentEquity;
        }
        
        const drawdown = highWaterMark - currentEquity;
        if (drawdown > maxDrawdownDollar) {
            maxDrawdownDollar = drawdown; 
        }

        curve.push({
          tradeNumber: tradeNumber,
          equity: parseFloat(currentEquity.toFixed(2)),
          ticker: trade.ticker,
          result: trade.result,
          gain: parseFloat(realizedGainLoss.toFixed(2)),
          highWaterMark: parseFloat(highWaterMark.toFixed(2)), 
        });
      }
    });

    curve.maxDrawdownDollar = maxDrawdownDollar; 
    
    return curve;
  }, [tradeHistory, accountSize]); 
  
  // --- Performance Metrics Calculation ---
  const performanceMetrics = useMemo(() => {
    const totalTrades = tradeHistory.length;
    const closedTrades = tradeHistory.filter(t => t.result !== 'Pending');
    const closedCount = closedTrades.length;
    const wins = closedTrades.filter(t => t.result === 'Win').length;
    const losses = closedTrades.filter(t => t.result === 'Loss' || t.result === 'Scratch').length; 
    const winRate = closedCount > 0 ? (wins / closedCount) * 100 : 0;
    
    const finalEquity = equityCurveData.length > 0 ? equityCurveData[equityCurveData.length - 1].equity : accountSize;
    const totalProfitLoss = finalEquity - accountSize;
    
    const maxDrawdownDollar = equityCurveData.maxDrawdownDollar || 0;
    const maxDrawdownPercent = accountSize > 0 ? (maxDrawdownDollar / accountSize) * 100 : 0; // Base on initial size

    // --- Expected Value Calculation ---
    const expectedValue = closedCount > 0 ? totalProfitLoss / closedCount : 0;

    return { 
        totalTrades, wins, losses, pending: totalTrades - closedCount, winRate, totalProfitLoss, finalEquity,
        maxDrawdownDollar, 
        maxDrawdownPercent,
        expectedValue: expectedValue, 
    };
  }, [tradeHistory, equityCurveData, accountSize]);

  
  // --- R-Multiple Distribution Calculation ---
  const rMultipleDistribution = useMemo(() => {
    const closedTrades = tradeHistory.filter(t => t.result !== 'Pending' && t.totalRiskAmount > 0);
    const distribution = {
      'Worst Case (R < -1)': 0,
      '-1R (Standard Loss)': 0,
      '0R (Scratch/Cost)': 0,
      '1R (Small/Partial Win)': 0,
      '2R (Target Hit)': 0,
      'Best Case (R > 2)': 0,
    };

    closedTrades.forEach(trade => {
      // Realized PnL: Net Gain for Win, -Net Risk for Loss, -Total Cost for Scratch
      let realizedPNL;
      const grossRisk = trade.totalRiskAmount || 0;
      const grossGain = grossRisk * (trade.targetRMultiple || 0);
      const totalCostValue = trade.totalCost || 0;
      
      if (trade.result === 'Win') {
        realizedPNL = grossGain - totalCostValue;
      } else if (trade.result === 'Loss') {
        realizedPNL = -(grossRisk + totalCostValue);
      } else { // Scratch
        realizedPNL = -totalCostValue; 
      }

      // R is PnL divided by the initial gross risk amount (1R dollar amount)
      const realizedR = grossRisk > 0 ? realizedPNL / grossRisk : 0;
      
      let binKey;
      if (realizedR < -1) {
        binKey = 'Worst Case (R < -1)';
      } else if (realizedR < -0.5) { // Includes trades where PnL is close to -1R gross
        binKey = '-1R (Standard Loss)';
      } else if (realizedR <= 0.5) { // Includes trades where R is close to 0 (scratch)
        binKey = '0R (Scratch/Cost)';
      } else if (realizedR <= 1.5) {
        binKey = '1R (Small/Partial Win)';
      } else if (realizedR <= 2.5) {
        binKey = '2R (Target Hit)';
      } else {
        binKey = 'Best Case (R > 2)';
      }
      
      distribution[binKey]++;
    });

    // Convert the distribution map to an array for recharts
    const chartData = Object.keys(distribution).map(key => ({
      rMultiple: key,
      count: distribution[key],
      color: key.includes('Loss') || key.includes('Worst Case') ? '#EF4444' : key.includes('Scratch') ? '#FBBF24' : '#10B981'
    }));

    return chartData;
  }, [tradeHistory]);


  // --- Input Change Handlers ---
  const handleInputChange = useCallback((setter, value, min=0) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num >= min) {
      setter(num);
      setCalcResultMessage('');
    } else if (value === '') {
       setter(0); 
    }
  }, []);

  const handleCalculate = useCallback(() => {
    if (accountSize <= 0 || entryPrice <= 0 || atrStopDistance <= 0) {
      setCalcResultMessage('Error: Please ensure Account Size, Entry Price, and Stop Distance are positive values.');
    } else if (maxShares === 0 && (accountSize * (riskPercent / 100)) > 0.01) {
      setCalcResultMessage(`Warning: ATR Stop Distance ($${atrStopDistance.toFixed(2)}) is too large. You cannot buy even 1 share without exceeding your $${(accountSize * (riskPercent / 100)).toFixed(2)} risk limit.`);
    } else {
      setCalcResultMessage('');
    }
  }, [accountSize, entryPrice, atrStopDistance, maxShares, riskPercent]);
  
  // --- LLM API CALL: Market Sentiment Advisor ---
  const fetchNewsAnalysis = useCallback(async (retryCount = 0) => {
    if (!ticker.trim()) return;

    setLoadingNews(true);
    setNewsAnalysis(null);
    setNewsError('');
    
    const maxRetries = 3;
    const systemPrompt = "Act as a specialized financial market analyst focused on technical and fundamental analysis. Your goal is to provide a concise, single-paragraph sentiment summary based on the latest available news and data. Conclude your analysis with a clear trade direction suggestion (Long, Short, or Neutral). Do not use markdown formatting like headings or bolding in your summary.";
    const userQuery = `Find recent news and market sentiment for the stock/ETF ticker ${ticker} and suggest a trade direction (Long/Short/Neutral). Provide a concise summary for a trade journal, including a mention of the current trend or risk factors.`;

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        tools: [{ "google_search": {} }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        const candidate = result.candidates?.[0];

        if (candidate && candidate.content?.parts?.[0]?.text) {
          const text = candidate.content.parts[0].text;
          
          let sources = [];
          const groundingMetadata = candidate.groundingMetadata;
          if (groundingMetadata && groundingMetadata.groundingAttributions) {
              sources = groundingMetadata.groundingAttributions
                  .map(attribution => ({
                      uri: attribution.web?.uri,
                      title: attribution.web?.title,
                  }))
                  .filter(source => source.uri && source.title); 
          }

          setNewsAnalysis({ text, sources });

        } else {
          throw new Error("Invalid response structure or no generated text.");
        }

    } catch (error) {
        console.error("API Call Error:", error);
        if (retryCount < maxRetries) {
            const delay = Math.pow(2, retryCount) * 1000;
            // console.log(`Retrying in ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchNewsAnalysis(retryCount + 1);
        }
        setNewsError(`Failed to get analysis for ${ticker} after ${maxRetries} attempts.`);
        setNewsAnalysis(null);

    } finally {
        setLoadingNews(false);
    }

  }, [ticker]);

  // --- FIREBASE API CALLS (SAVE, UPDATE, DELETE TRADE) ---
  const saveTrade = useCallback(async () => {
    if (!db || !userId || !isAuthReady) {
      setSaveMessage('Error: Database not ready. Please wait or check connection.');
      return;
    }
    if (maxShares === 0) {
        setSaveMessage('Error: Cannot save trade with 0 maximum shares.');
        return;
    }

    setSaving(true);
    setSaveMessage('');

    try {
      const entryData = createTradeEntry(
        maxShares, 
        totalRiskAmount, 
        totalCost, 
        netRisk,   
        netGain,   
        entryPrice, 
        atrStopDistance, 
        ticker, 
        newsAnalysis,
        targetRMultiple 
      );

      const journalCollectionPath = `artifacts/${appId}/users/${userId}/trade_journal`;
      await addDoc(collection(db, journalCollectionPath), entryData);
      
      setSaveMessage('Trade successfully logged to Journal! (Mark its result below)');
    } catch (error) {
      console.error("Error saving document: ", error);
      setSaveMessage(`Error logging trade: ${error.message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(''), 5000); 
    }
  }, [db, userId, isAuthReady, maxShares, totalRiskAmount, totalCost, netRisk, netGain, entryPrice, atrStopDistance, ticker, newsAnalysis, targetRMultiple]);

  const updateTradeResult = useCallback(async (tradeId, result) => {
    if (!db || !userId || !isAuthReady) {
      console.error('Database not ready.');
      return;
    }
    
    setUpdateStatus(prev => ({ ...prev, [tradeId]: 'loading' }));

    try {
      const journalDocPath = `artifacts/${appId}/users/${userId}/trade_journal/${tradeId}`;
      await updateDoc(doc(db, journalDocPath), { result });
      
      setUpdateStatus(prev => ({ ...prev, [tradeId]: 'success' }));
    } catch (error) {
      console.error("Error updating document: ", error);
      setUpdateStatus(prev => ({ ...prev, [tradeId]: 'error' }));
    } finally {
      setTimeout(() => setUpdateStatus(prev => ({ ...prev, [tradeId]: null })), 2000);
    }
  }, [db, userId, isAuthReady]);

  const deleteTrade = useCallback(async (tradeId) => {
    if (!db || !userId || !isAuthReady) {
      console.error('Database not ready.');
      return;
    }
    
    setUpdateStatus(prev => ({ ...prev, [tradeId]: 'deleting' }));

    try {
      const journalDocPath = `artifacts/${appId}/users/${userId}/trade_journal/${tradeId}`;
      await deleteDoc(doc(db, journalDocPath));
    } catch (error) {
      console.error("Error deleting document: ", error);
      setUpdateStatus(prev => ({ ...prev, [tradeId]: 'error' }));
    } finally {
      setTimeout(() => setUpdateStatus(prev => ({ ...prev, [tradeId]: null })), 1000);
    }
  }, [db, userId, isAuthReady]);

  // --- Helper Components ---
  // A clean card for input data (Value Card)
  const ValueCard = ({ icon: Icon, title, value, unit, color = 'text-gray-900', secondary = false }) => (
    <div className={`flex flex-col p-4 rounded-xl shadow-md transition duration-300 ${secondary ? 'bg-indigo-50 border border-indigo-200' : 'bg-white border border-slate-200'}`}>
      <div className={`flex items-center mb-1 ${color}`}>
        <Icon className="w-5 h-5 mr-2" />
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">{title}</h3>
      </div>
      <p className={`text-2xl font-extrabold ${color} mt-1`}>
        {unit === '$' && unit}{value.toLocaleString(undefined, { minimumFractionDigits: unit === ' Shares' || unit === 'X' ? 0 : 2, maximumFractionDigits: 2 })}{unit !== '$' && unit}
      </p>
    </div>
  );

  // A striking card for primary results (Result Card)
  const ResultCard = ({ title, value, unit, color, Icon }) => (
     <div className={`flex flex-col items-center p-6 bg-white rounded-xl shadow-2xl transition duration-300 transform hover:scale-[1.01] border-b-8 ${color}`}>
        <Icon className="w-10 h-10 mb-3 text-white bg-gray-900 p-2 rounded-full shadow-lg" />
        <h3 className="text-lg font-bold text-gray-700 mb-1">{title}</h3>
        <p className={`text-4xl font-extrabold ${color.includes('green') ? 'text-green-600' : color.includes('red') ? 'text-red-600' : 'text-indigo-600'} mt-1`}>
            {unit === '$' && unit}{value.toLocaleString(undefined, { maximumFractionDigits: unit === ' Shares' ? 0 : 2 })}{unit !== '$' && unit}
        </p>
    </div>
  );

  // Input Field component for consistent styling
  const InputField = ({ label, value, setter, min, step, unit, tooltip, onBlur }) => (
    <div className="flex flex-col">
      <label className="text-sm font-medium text-gray-600 mb-1 flex items-center">
        {label}
        {unit && <span className="text-xs text-gray-400 ml-1">({unit})</span>}
      </label>
      <input 
        type="number" 
        value={value} 
        onChange={(e) => handleInputChange(setter, e.target.value, min)} 
        onBlur={onBlur} 
        className="p-3 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition shadow-sm w-full bg-white" 
        step={step} 
        min={min} 
      />
      {tooltip && <p className="mt-1 text-xs text-gray-400">{tooltip}</p>}
    </div>
  );


  // --- Render ---
  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* Header & Auth Info */}
        <header className="text-center mb-10">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-2">ASSAP: Trading Strategy Simulator</h1>
            <p className="text-gray-500 max-w-3xl mx-auto text-lg">
                **Analyze, Size, Signal, and Post-Trade.** Ensure your strategy has a positive Expected Value.
            </p>
            {userId && (
                <p className="text-xs text-gray-400 mt-3">
                    <Database className="w-3 h-3 inline-block mr-1 align-sub" /> Logged in securely as: <span className="font-mono text-indigo-500">{userId}</span>
                </p>
            )}
            {dbError && (
                <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-xl font-semibold border border-red-300 shadow-md">
                    Database Error: {dbError}
                </div>
            )}
             {loadingSettings && (
                <div className="mt-4 p-3 bg-indigo-100 text-indigo-700 rounded-xl font-semibold border border-indigo-300 flex items-center justify-center shadow-md">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Loading user settings...
                </div>
            )}
        </header>

        {/* --- 1. Risk Control Section (Sizing) - Moved to top for priority --- */}
        <div className="bg-white p-6 md:p-8 rounded-xl shadow-2xl border border-slate-100 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center"><Scale className="w-6 h-6 mr-2 text-indigo-600" /> 1. Position Sizing & Risk Control</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <InputField label="Account Size" value={accountSize} setter={setAccountSize} onBlur={handleCalculate} unit='$' />
            <InputField label="Risk per Trade" value={riskPercent} setter={setRiskPercent} onBlur={handleCalculate} unit='%' />
            <InputField label="Entry Price" value={entryPrice} setter={setEntryPrice} onBlur={handleCalculate} unit='$' />
            <ValueCard icon={Target} title={`Max Dollar Risk (${riskPercent}%)`} value={accountSize * (riskPercent / 100)} unit='$' color="text-red-600"/>
          </div>

          <h3 className="text-xl font-bold text-gray-700 mt-8 mb-4 border-t pt-4">Trade Parameters</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <InputField 
                label="ATR Stop Distance" 
                value={atrStopDistance} 
                setter={setAtrStopDistance} 
                onBlur={handleCalculate} 
                unit='$' 
                tooltip="Difference between entry price and stop price (1R dollar value)."
            />
            <InputField 
                label="Target R-Multiple" 
                value={targetRMultiple} 
                setter={setTargetRMultiple} 
                onBlur={handleCalculate} 
                unit='X' 
                step="0.5" 
                min="0.5" 
                tooltip="Desired Risk-to-Reward ratio (e.g., 2.0)."
            />
            <InputField 
                label="Est. Total Trade Cost" 
                value={totalTradeCost} 
                setter={setTotalTradeCost} 
                onBlur={handleCalculate} 
                unit='$' 
                step="0.01" 
                min="0" 
                tooltip="Commissions/Slippage for the round-trip trade."
            />
          </div>
          
          <div className="mt-8 pt-4 border-t border-slate-100 flex justify-between items-center">
            <button 
              onClick={saveDefaultSettings}
              disabled={!isAuthReady || loadingSettings}
              className={`py-2 px-4 rounded-lg font-bold transition duration-300 ease-in-out shadow-md flex items-center justify-center text-sm ${
                !isAuthReady || loadingSettings ? 'bg-gray-300 cursor-not-allowed text-gray-600' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              <Settings className="w-4 h-4 mr-2" />
              Save Settings as Default
            </button>
            {settingsMessage && (
                <p className={`text-sm font-semibold ${settingsMessage.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>{settingsMessage}</p>
            )}
          </div>
        </div>

        {/* --- 2. Execution Summary & Journaling --- */}
        <div className="bg-white p-6 md:p-8 rounded-xl shadow-2xl border border-slate-100 mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center"><Zap className="w-6 h-6 mr-2 text-yellow-600" /> 2. Pre-Trade Execution Summary</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <ResultCard title="MAX SHARES TO BUY" value={maxShares} unit=' Shares' color="border-indigo-500" Icon={Scale}/>
                <ResultCard title="MAX NET LOSS (Net Risk)" value={netRisk} unit='$' color="border-red-500" Icon={TrendingDownIcon}/>
                <ResultCard title={`POTENTIAL NET GAIN (${targetRMultiple}R)`} value={netGain} unit='$' color="border-green-500" Icon={TrendingUpIcon}/>
            </div>
            
            {/* Detailed Risk Summary Table with User-Defined R-Multiple */}
            {maxShares > 0 && (
                <div className="md:col-span-3 mt-6 p-6 bg-slate-50 rounded-xl shadow-inner border border-slate-200">
                    <h3 className="text-xl font-bold text-gray-700 mb-4 flex items-center"><Target className="w-5 h-5 mr-2 text-indigo-600"/> Detailed Targets ({targetRMultiple}R)</h3>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                        <ValueCard icon={MinusCircle} title="Total Cost (Friction)" value={totalCost} unit='$' color="text-gray-500" secondary={true} />
                        <ValueCard icon={TrendingDown} title="Stop Price" value={stopPrice} unit='$' color="text-red-500" secondary={true} />
                        <ValueCard icon={Target} title={`Target ${targetRMultiple}R Price`} value={targetRPrice} unit='$' color="text-green-600" secondary={true} />
                        <ValueCard icon={Activity} title={`Net R-Multiple`} value={netGain / netRisk} unit='X' color="text-indigo-600" secondary={true} />
                    </div>
                </div>
            )}

            <div className="mt-8 pt-4 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
                <button 
                    onClick={saveTrade}
                    disabled={saving || maxShares === 0 || !isAuthReady}
                    className={`py-3 px-8 w-full md:w-auto rounded-lg font-bold transition duration-300 ease-in-out shadow-lg flex items-center justify-center ${
                      (saving || maxShares === 0 || !isAuthReady) ? 'bg-gray-400 cursor-not-allowed text-gray-700' : 'bg-yellow-500 hover:bg-yellow-600 text-gray-900'
                    }`}
                >
                    <Save className="w-5 h-5 mr-2" />
                    {saving ? 'Logging Trade...' : 'SAVE TRADE TO JOURNAL'}
                </button>
                
                {(calcResultMessage || saveMessage) && (
                    <div className={`p-3 rounded-lg font-semibold w-full md:w-auto text-center ${
                        calcResultMessage.startsWith('Error') ? 'bg-red-100 text-red-700' : 
                        calcResultMessage.startsWith('Warning') ? 'bg-yellow-100 text-yellow-700' :
                        saveMessage.startsWith('Error') ? 'bg-red-100 text-red-700' :
                        saveMessage.startsWith('Trade successfully') ? 'bg-green-100 text-green-700' :
                        'bg-indigo-100 text-indigo-700'
                    }`}>
                        {calcResultMessage || saveMessage}
                    </div>
                )}
            </div>
        </div>
        
        {/* --- 3. News Analysis Section (Signal) - Finalized API Call --- */}
        <div className="bg-white p-6 md:p-8 rounded-xl shadow-2xl border border-slate-100 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center"><Newspaper className="w-6 h-6 mr-2 text-green-600" /> 3. Market Sentiment Advisor (Signal)</h2>
          
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <input type="text" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} className="p-3 border border-slate-300 rounded-lg focus:ring-green-500 focus:border-green-500 transition shadow-sm sm:w-1/3" placeholder="Enter Ticker (e.g., QQQ)" />
            <button onClick={() => fetchNewsAnalysis()} disabled={loadingNews} className={`py-3 px-6 rounded-lg font-bold transition duration-300 ease-in-out shadow-md flex items-center justify-center ${ loadingNews ? 'bg-green-300 cursor-not-allowed text-white' : 'bg-green-600 hover:bg-green-700 text-white'} sm:w-auto`}>
              {loadingNews ? (<span className="flex items-center"><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Analyzing News...</span>) : 'Get Sentiment Analysis'}
            </button>
          </div>
          
          <div className="mt-4 bg-slate-50 p-4 rounded-lg shadow-inner min-h-[100px] border border-slate-200">
            {newsError && <p className="text-red-500 font-semibold">{newsError}</p>}
            {newsAnalysis && (
              <div>
                <p className="text-gray-700 font-medium mb-3">{newsAnalysis.text}</p>
                {newsAnalysis.sources && newsAnalysis.sources.length > 0 && (
                    <div className="mt-3 text-xs text-gray-500">
                        <p className="font-semibold mb-1">Sources:</p>
                        <ul className="list-disc list-inside space-y-0.5">
                            {newsAnalysis.sources.map((source, index) => (
                                <li key={index} className="truncate"><a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-700">{source.title}</a></li>
                            ))}
                        </ul>
                    </div>
                )}
              </div>
            )}
            {!loadingNews && !newsAnalysis && !newsError && (<p className="text-gray-500 italic">Enter a ticker to check the current market sentiment and direction.</p>)}
          </div>
        </div>

        {/* --- 4. Performance Metrics Dashboard --- */}
        <div className="mt-12 p-6 bg-slate-800 rounded-xl shadow-2xl border-b-4 border-indigo-500">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center"><BarChart3 className="w-6 h-6 mr-2 text-indigo-400" /> 4. Strategy Performance Metrics</h2>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-4 text-center">
                
                {/* Total Trades */}
                <div className="p-3 bg-slate-700 rounded-lg shadow-lg text-white">
                    <p className="text-xs font-semibold text-slate-300">Total Trades</p>
                    <p className="text-3xl font-extrabold">{performanceMetrics.totalTrades}</p>
                </div>
                {/* Wins */}
                <div className="p-3 bg-slate-700 rounded-lg shadow-lg text-white">
                    <p className="text-xs font-semibold text-slate-300">Wins</p>
                    <p className="text-3xl font-extrabold text-green-400">{performanceMetrics.wins}</p>
                </div>
                {/* Losses */}
                <div className="p-3 bg-slate-700 rounded-lg shadow-lg text-white">
                    <p className="text-xs font-semibold text-slate-300">Losses / Scratches</p>
                    <p className="text-3xl font-extrabold text-red-400">{performanceMetrics.losses}</p>
                </div>
                {/* Win Rate */}
                <div className="p-3 bg-indigo-500 rounded-lg shadow-lg text-white">
                    <p className="text-xs font-semibold text-indigo-200">Win Rate</p>
                    <p className={`text-3xl font-extrabold`}>{performanceMetrics.winRate.toFixed(1)}%</p>
                </div>

                {/* Expected Value Card - MOST IMPORTANT METRIC */}
                <div className="p-3 bg-white rounded-lg shadow-lg border-t-4 border-indigo-600">
                    <p className="text-xs font-semibold text-gray-500 flex items-center justify-center"><DollarSign className="w-3 h-3 mr-1"/> **Exp. Value ($/Trade)**</p>
                    <p className={`text-3xl font-extrabold ${performanceMetrics.expectedValue >= 0 ? 'text-indigo-700' : 'text-red-700'}`}>
                        {performanceMetrics.expectedValue.toFixed(2)}
                    </p>
                </div>

                {/* Max Drawdown ($) */}
                <div className="p-3 bg-slate-700 rounded-lg shadow-lg text-white border-t-4 border-red-500">
                    <p className="text-xs font-semibold text-slate-300 flex items-center justify-center"><CornerDownLeft className="w-3 h-3 mr-1"/> Max Drawdown ($)</p>
                    <p className="text-3xl font-extrabold text-red-400">${performanceMetrics.maxDrawdownDollar.toFixed(2)}</p>
                </div>
                {/* Max Drawdown (%) */}
                <div className="p-3 bg-slate-700 rounded-lg shadow-lg text-white border-t-4 border-red-500">
                    <p className="text-xs font-semibold text-slate-300 flex items-center justify-center"><CornerDownLeft className="w-3 h-3 mr-1"/> Max Drawdown (%)</p>
                    <p className="text-3xl font-extrabold text-red-400">{performanceMetrics.maxDrawdownPercent.toFixed(1)}%</p>
                </div>
            </div>
            <p className="mt-4 text-sm text-indigo-200 italic">Expected Value is the key to long-term profitability. Aim for a positive number.</p>
        </div>
        
        {/* --- 5. Running Equity Curve (Performance Tracker) --- */}
        <div className="mt-12">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center"><Activity className="w-6 h-6 mr-2 text-indigo-600" /> 5. Running Equity Curve (Performance Tracker)</h2>
            <div className="bg-white p-6 rounded-xl shadow-2xl border border-slate-100 h-[400px]">
                {equityCurveData.length > 1 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={equityCurveData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                            <XAxis dataKey="tradeNumber" label={{ value: 'Trade Number', position: 'bottom', fill: '#374151' }} stroke="#374151" />
                            <YAxis 
                                domain={['auto', 'auto']}
                                tickFormatter={(value) => `$${value.toLocaleString()}`}
                                label={{ value: 'Equity Value ($)', angle: -90, position: 'insideLeft', fill: '#374151' }}
                                stroke="#374151"
                            />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '8px', padding: '10px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                formatter={(value, name, props) => {
                                    return [`$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, name];
                                }}
                                labelFormatter={(label) => {
                                    const dataPoint = equityCurveData.find(d => d.tradeNumber === label);
                                    const drawdown = dataPoint ? dataPoint.highWaterMark - dataPoint.equity : 0;
                                    return (
                                      <div className="font-bold text-gray-800">
                                        Trade #{label}: {dataPoint?.ticker} ({dataPoint?.result})<br/>
                                        <span className={`text-sm font-normal ${drawdown > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                          Drawdown: ${drawdown.toFixed(2)}
                                        </span>
                                      </div>
                                    );
                                }}
                            />
                            <Legend verticalAlign="top" height={36}/>
                            <Line 
                                type="monotone" 
                                dataKey="equity" 
                                stroke="#4F46E5" 
                                strokeWidth={3}
                                dot={false} 
                                name="Equity Curve"
                                animationDuration={500}
                            />
                            <Line 
                                type="monotone" 
                                dataKey="highWaterMark" 
                                stroke="#DC2626" 
                                strokeDasharray="5 5" 
                                strokeWidth={1}
                                dot={false} 
                                name="High Water Mark (Max DD Ref.)"
                                animationDuration={500}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-full text-center text-gray-500">
                        <p>Log at least one closed trade (Win/Loss/Scratch) to start building your Equity Curve.</p>
                    </div>
                )}
            </div>
        </div>

        {/* --- 6. R-Multiple Distribution (Statistical Edge) --- */}
        <div className="mt-12">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center"><BarChart3 className="w-6 h-6 mr-2 text-indigo-600" /> 6. R-Multiple Distribution (Statistical Edge)</h2>
            <div className="bg-white p-6 rounded-xl shadow-2xl border border-slate-100 h-[400px]">
                {tradeHistory.filter(t => t.result !== 'Pending').length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={rMultipleDistribution} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e0e0e0" />
                            <XAxis 
                                dataKey="rMultiple" 
                                angle={-30} 
                                textAnchor="end" 
                                height={60} 
                                interval={0} 
                                tickLine={false}
                                style={{ fontSize: '12px' }}
                                label={{ value: 'Realized R-Multiple Bin', position: 'bottom', dy: 20, fill: '#374151' }}
                            />
                            <YAxis 
                                allowDecimals={false}
                                label={{ value: 'Trade Count', angle: -90, position: 'insideLeft', fill: '#374151' }}
                            />
                            <Tooltip 
                                cursor={{ fill: '#f3f4f6', opacity: 0.5 }}
                                contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '8px', padding: '10px' }}
                                formatter={(value, name, props) => [`${value} Trades`, 'Frequency']}
                            />
                            <Legend verticalAlign="top" height={36}/>
                            <Bar dataKey="count" name="Trade Count" fill="#4F46E5" radius={[10, 10, 0, 0]}>
                                {rMultipleDistribution.map((entry, index) => (
                                    <Bar key={`bar-${index}`} fill={entry.color} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-full text-center text-gray-500">
                        <p>Close at least one trade (Win/Loss/Scratch) in the journal to view your R-Multiple distribution.</p>
                    </div>
                )}
            </div>
        </div>

        {/* --- 7. Trade History Journal --- */}
        <div className="mt-12">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center"><Clock className="w-6 h-6 mr-2 text-gray-500" /> 7. Trading Journal History</h2>
            
            <div className="bg-white rounded-xl shadow-2xl border border-slate-100 min-h-[150px] overflow-x-auto">
                {tradeHistory.length === 0 && (
                    <p className="text-gray-500 italic p-6 text-center">Your trade journal is currently empty. Calculate a trade and click 'Save Trade to Journal' to begin logging your decisions.</p>
                )}
                
                {tradeHistory.length > 0 && (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-slate-50 sticky top-0">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticker</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shares</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entry ($)</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stop ($)</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Net Risk ($)</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Net Gain ($)</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">R-Target</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Result</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th> 
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {tradeHistory.map((trade) => (
                                <tr key={trade.id} className="hover:bg-slate-50 transition duration-150">
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">{trade.timestamp instanceof Date ? trade.timestamp.toLocaleTimeString() : '...'}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-indigo-600">{trade.ticker}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-green-600 font-bold">{trade.maxShares}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">${trade.entryPrice.toFixed(2)}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-red-600">${(trade.entryPrice - trade.atrStopDistance).toFixed(2)}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-red-700 font-bold">${(trade.netRisk || 0).toFixed(2)}</td> 
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-green-700 font-bold">${(trade.netGain || 0).toFixed(2)}</td> 
                                     <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">{trade.targetRMultiple}X</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                                        <div className="flex space-x-2 items-center">
                                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                                                trade.result === 'Win' ? 'bg-green-100 text-green-800' :
                                                trade.result === 'Loss' ? 'bg-red-100 text-red-800' :
                                                trade.result === 'Scratch' ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-gray-100 text-gray-800'
                                            }`}>
                                                {trade.result}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                                        <div className="flex space-x-1 items-center">
                                            {trade.result === 'Pending' && (
                                                <>
                                                    <button 
                                                        onClick={() => updateTradeResult(trade.id, 'Win')}
                                                        disabled={updateStatus[trade.id] === 'loading'}
                                                        className="p-1 text-green-600 hover:text-green-800 rounded-full transition duration-150 hover:bg-green-100 disabled:opacity-50"
                                                        title="Mark as Win"
                                                    >
                                                        <CheckCircle className="w-5 h-5" />
                                                    </button>
                                                    <button 
                                                        onClick={() => updateTradeResult(trade.id, 'Loss')}
                                                        disabled={updateStatus[trade.id] === 'loading'}
                                                        className="p-1 text-red-600 hover:text-red-800 rounded-full transition duration-150 hover:bg-red-100 disabled:opacity-50"
                                                        title="Mark as Loss"
                                                    >
                                                        <TrendingDown className="w-5 h-5" />
                                                    </button>
                                                    <button 
                                                        onClick={() => updateTradeResult(trade.id, 'Scratch')}
                                                        disabled={updateStatus[trade.id] === 'loading'}
                                                        className="p-1 text-yellow-600 hover:text-yellow-800 rounded-full transition duration-150 hover:bg-yellow-100 disabled:opacity-50"
                                                        title="Mark as Scratch/Break-Even"
                                                    >
                                                        <MinusCircle className="w-5 h-5" />
                                                    </button>
                                                </>
                                            )}
                                            <button 
                                                onClick={() => deleteTrade(trade.id)}
                                                disabled={updateStatus[trade.id] === 'deleting'}
                                                className="p-1 text-gray-400 hover:text-red-600 rounded-full transition duration-150 hover:bg-red-100 disabled:opacity-50 ml-2"
                                                title="Delete Trade"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                            {updateStatus[trade.id] === 'loading' && (
                                                <svg className="animate-spin h-5 w-5 text-indigo-500 ml-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>


      </div>
    </div>
  );
};

export default App;
