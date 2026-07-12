#!/usr/bin/env bash
# Post-hoc diff of snap-raw.log produced by observe-sys1b.sh.
# Runs on a COMPLETE capture file, so no live-buffering/loss risk.
# Emits: wall  mono  NEW|MOD|DEL  tag(*=target T=thumbnail M=metadata)  filename
#
# Usage: ./snap-diff.sh <capturedir>/snap-raw.log [target-uuid]
set -euo pipefail
RAW="${1:?usage: snap-diff.sh snap-raw.log [target-uuid]}"
TARGET="${2:-6dc48b38-4709-4c41-8b49-77d5e0b1630a}"

awk -v target="$TARGET" '
  function tag(p,  t){t="";if(index(p,target))t="*";if(index(p,".thumbnails"))t=t"T";else if(p~/\.metadata$/)t=t"M";return (t==""?"-":t)}
  function base(p){n=split(p,a,"/");return a[n]}
  /^@SNAP/{
    if(primed){
      for(p in cur){
        if(!(p in prev)) printf "%s %s NEW %s %s\n",clk,mono,tag(p),base(p)
        else if(cur[p]!=prev[p]){split(prev[p],o," ");split(cur[p],c," ");printf "%s %s MOD %s %s %s->%s\n",clk,mono,tag(p),base(p),o[2],c[2]}
      }
      for(p in prev) if(!(p in cur)) printf "%s %s DEL %s %s\n",clk,mono,tag(p),base(p)
    }
    n=0;for(p in prev)delete prev[p];for(p in cur){prev[p]=cur[p];delete cur[p];n++}
    if(n>0&&seen)primed=1; seen=1; clk=$2; mono=$3; next
  }
  NF>=3{mt=$1;sz=$2;$1="";$2="";sub(/^ */,"");cur[$0]=mt" "sz}
' "$RAW"
