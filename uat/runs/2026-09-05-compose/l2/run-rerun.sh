R=uat/runs/2026-09-05-compose
for c in lena priyanka yuki ravi; do
  cat $R/l2/_prelude.js $R/l2/$c.js | MSYS_NO_PATHCONV=1 SHOT_DIR=$R/shots/$c CREATED_FILE=$R/created.json node uat/driver/drive-script.mjs $c > $R/l2/journals/$c.json 2> $R/l2/journals/$c.log
  echo "== $c exit=$?"
  grep -E "^(FAIL|DRIVER)" $R/l2/journals/$c.log
done
echo ALL-DONE
