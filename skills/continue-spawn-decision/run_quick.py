#!/usr/bin/env python3
import sys
sys.path.insert(0, '/Users/huahaha/.openclaw/workspace/skills/continue-spawn-decision')
from decide import analyze_context_overlap, decide_action

current = {
    'files': ['src/auth/validate.ts', 'src/auth/types.ts', 'src/session/manager.ts'],
    'concepts': ['authentication', 'JWT', 'session', 'middleware']
}

# 场景: 修 validate.ts 的 JWT 逻辑
o = analyze_context_overlap(
    current['files'], current['concepts'],
    ['src/auth/validate.ts', 'src/auth/types.ts', 'src/auth/middleware.ts'],
    ['JWT', 'auth'],
    '修 src/auth/validate.ts 的 JWT 逻辑错误'
)
r = decide_action(o, 'implementation', return_dict=True)
print(f"任务: 修 JWT 逻辑")
print(f"文件重叠: {o['file_overlap']:.0%} | 加权: {o['weighted_score']:.0%}")
print(f"决策: {r['recommendation'].upper()}")
print(f"理由: {r['reason']}")
print(f"行动: {r['action']}")
