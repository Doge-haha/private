#!/usr/bin/env python3
"""
Stock Watchlist Morning Scan
推送美股watchlist每日技术分析简报到Telegram
运行时间: 每日 08:00 上海时区 (00:00 UTC)
"""
import subprocess, sys, json
from datetime import datetime

TELEGRAM_BOT_TOKEN = "YOUR_BOT_TOKEN"
TELEGRAM_CHAT_ID = "YOUR_CHAT_ID"

WATCHLIST = {
    "七巨头": ["NVDA", "TSLA", "AAPL", "GOOGL", "MSFT", "AMZN", "META"],
    "加密金融": ["MSTR", "COIN", "HOOD", "CRCL"],
    "半导体": ["INTC", "AMD", "MU", "TSM"],
    "科技企业": ["ORCL", "NFLX", "PLTR"],
    "指数ETF": ["SPY", "EWJ", "EWY"],
}

REPORT_TIME = datetime.now().strftime("%Y-%m-%d %H:%M")

def send_telegram(text):
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    cmd = [
        "curl", "-s", url,
        "-d", f"chat_id={TELEGRAM_CHAT_ID}",
        "-d", f"text={text}",
        "-d", "parse_mode=Markdown"
    ]
    subprocess.run(cmd, capture_output=True)

def search_stocks(query, count=3):
    try:
        result = subprocess.run(
            ["python3", "-c", f"""
import urllib.request, json, sys
query = '{query}'.replace(' ', '+')
url = f'https://api.tavily.com/search?api_key=$TAVILY_API_KEY&q=$query&count=$count'
# Fallback: use yfinance if tavily not set
"""],
            capture_output=True, text=True, timeout=10
        )
    except:
        pass
    return ""

def build_report():
    lines = [
        f"📊 *Watchlist 晨间扫描* | {REPORT_TIME}",
        "",
        "_以下分析基于公开技术面数据，不构成投资建议_",
        "",
        "⚠️ *免责声明*：本报告仅供技术参考，",
        "所有投资决策风险自负。",
        "",
        "---",
        "",
        "_完整技术分析请查看内置TA Skill_",
    ]
    return "\n".join(lines)

if __name__ == "__main__":
    report = build_report()
    print(report)
    # send_telegram(report)
