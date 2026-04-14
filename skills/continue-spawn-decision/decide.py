#!/usr/bin/env python3
"""
Continue/Spawn Decision Engine - Python Version
Wrapper for decision.ts core logic

Usage:
  python3 decide.py "task_description" --type implementation --files src/auth/validate.ts --session session_id

Or import as module:
  from decide import analyze, decide, decide_from_session
"""

import sys
import json
import re
from pathlib import Path

# ============================================================
# Core Logic (mirrors decision.ts)
# ============================================================

STOP_WORDS = {
    'the', 'this', 'that', 'with', 'from', 'have', 'has', 'will',
    'would', 'could', 'should', 'there', 'their', 'what', 'which',
    'when', 'where', 'how', 'why', 'and', 'for', 'not', 'are',
    'was', 'were', 'been', 'being', 'can', 'may', 'just', 'like',
}


def compute_set_overlap(a: list, b: list) -> float:
    if not a or not b:
        return 0.0
    set_a, set_b = set(a), set(b)
    inter = set_a & set_b
    union = set_a | set_b
    return len(inter) / len(union) if union else 0.0


def normalize_path(p: str) -> str:
    return (p.replace('^~/', '')
              .replace('^\\.\\/', '')
              .replace('\\/[^\\/]+$', '')  # strip filename, keep dir
              .lower())


def extract_concepts(text: str) -> list:
    matches = re.findall(r'[a-zA-Z][a-zA-Z0-9]{2,}', text or '')
    return list(set(m.lower() for m in matches if m.lower() not in STOP_WORDS))


def compute_list_overlap(a: list, b: list) -> float:
    if not a or not b:
        return 0.0
    set_b = set(str(x) for x in b)
    matches = [x for x in a if str(x) in set_b]
    return len(matches) / max(len(a), len(b))


def analyze_context_overlap(
    current_files: list,
    current_concepts: list,
    new_task_files: list,
    new_task_concepts: list,
    new_task_description: str,
    current_task_description: str = "",
    current_tool_names: list = None,
) -> dict:
    """
    Returns: {file_overlap, concept_overlap, tool_overlap, message_overlap, weighted_score}
    Weights: file=0.4, concept=0.3, tool=0.2, message=0.1
    """
    fo = compute_set_overlap(
        [normalize_path(f) for f in new_task_files],
        [normalize_path(f) for f in current_files]
    )
    concepts = new_task_concepts or extract_concepts(new_task_description)
    co = compute_set_overlap(concepts, current_concepts)
    tool_names = current_tool_names or []
    to = compute_list_overlap(new_task_files, tool_names) * 0.3
    msg_overlap = compute_set_overlap(
        extract_concepts(new_task_description),
        extract_concepts(current_task_description)
    ) * 0.1
    weighted = fo * 0.4 + co * 0.3 + to * 0.2 + msg_overlap * 0.1

    return {
        "file_overlap": round(fo, 3),
        "concept_overlap": round(co, 3),
        "tool_overlap": round(to, 3),
        "message_overlap": round(msg_overlap, 3),
        "weighted_score": round(weighted, 3),
    }


def decide_action(
    overlap: dict,
    task_type: str,
    return_dict: bool = False,
) -> dict | str:
    """
    Returns decision based on overlap score + taskType rules.
    
    Rules (方案B):
    - verification → spawn_fresh (forced)
    - simple → spawn_fresh (forced)
    - file_overlap >= 0.5 → continue (forced)
    - weighted_score >= 0.6 → continue
    - weighted_score <= 0.3 → spawn_fresh
    - 0.3 < weighted_score < 0.6 → implementation: continue, else: spawn_fresh
    """
    fo = overlap["file_overlap"]
    ws = overlap["weighted_score"]

    if task_type == "verification":
        rec, reason, confidence = "spawn_fresh", "verification类型强制独立验证", 1.0
    elif task_type == "simple":
        rec, reason, confidence = "spawn_fresh", "simple类型无需上下文", 1.0
    elif fo >= 0.5:
        # 方案B: 文件重叠主导
        rec, reason, confidence = "continue", f"文件重叠{fo:.0%}≥50%，同一文件的上下文有复用价值", fo
    elif ws >= 0.6:
        rec, reason, confidence = "continue", f"加权分数{ws:.0%}≥60%", (ws - 0.6) / 0.4
    elif ws <= 0.3:
        confidence = (0.3 - ws) / 0.3
        rec, reason = "spawn_fresh", f"加权分数{ws:.0%}≤30%，上下文低重叠"
    elif task_type == "implementation":
        rec, reason, confidence = "continue", f"implementation中等重叠{ws:.0%}软倾向continue", 0.5
    else:
        rec, reason, confidence = "spawn_fresh", f"中间地带{ws:.0%}，倾向spawn_fresh", 0.5

    result = {
        "recommendation": rec,
        "confidence": round(min(confidence, 1.0), 3),
        "overlap": overlap,
        "task_type": task_type,
        "reason": reason,
        "action": "sessions_send(现有session, 任务)" if rec == "continue" else "sessions_spawn(新session, 任务)",
    }

    if return_dict:
        return result

    # Human-readable output
    lines = [
        f"[DECISION] {rec.upper()}",
        f"  置信度: {result['confidence']:.0%}",
        f"  决策理由: {reason}",
        "",
        "  重叠度分析:",
        f"    文件重叠: {fo:.0%} (权重40%)",
        f"    概念重叠: {overlap['concept_overlap']:.0%} (权重30%)",
        f"    工具重叠: {overlap['tool_overlap']:.0%} (权重20%)",
        f"    消息重叠: {overlap['message_overlap']:.0%} (权重10%)",
        f"    加权总分: {ws:.0%}",
        "",
        f"  → {result['action']}",
    ]
    return "\n".join(lines)


# ============================================================
# CLI Interface
# ============================================================

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Continue/Spawn Decision Engine")
    parser.add_argument("task_description", help="新任务的描述")
    parser.add_argument("--type", "-t", default="implementation",
                        choices=["research", "implementation", "verification", "simple"],
                        help="任务类型 (default: implementation)")
    parser.add_argument("--files", "-f", nargs="+", default=[],
                        help="新任务涉及的目标文件")
    parser.add_argument("--concepts", "-c", nargs="+", default=[],
                        help="新任务涉及的核心概念")
    parser.add_argument("--current-files", nargs="+", default=[],
                        help="当前session已操作的文件")
    parser.add_argument("--current-concepts", nargs="+", default=[],
                        help="当前session讨论的核心概念")
    parser.add_argument("--session", "-s", default="unknown",
                        help="当前session ID")
    parser.add_argument("--json", "-j", action="store_true",
                        help="输出JSON格式")
    parser.add_argument("--quick", "-q", action="store_true",
                        help="快速模式: 只输出决策和理由")

    args = parser.parse_args()

    overlap = analyze_context_overlap(
        current_files=args.current_files,
        current_concepts=args.current_concepts,
        new_task_files=args.files,
        new_task_concepts=args.concepts or None,
        new_task_description=args.task_description,
    )

    result = decide_action(overlap, args.type, return_dict=args.json)

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    elif args.quick:
        print(f"{result['recommendation'].upper()} | {result['reason']}")
    else:
        print(f"[Session: {args.session}]")
        print(f"[Task: {args.task_description[:60]}{'...' if len(args.task_description)>60 else ''}]")
        print(f"[Type: {args.type}]")
        print()
        print(result)


if __name__ == "__main__":
    main()
