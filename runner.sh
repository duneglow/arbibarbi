#!/bin/sh

# file dove ci sara' il log di una singola run.
# Viene sovrascritto a ogni ri-esecuzione di doit.js
LOGFILE_TEMP="/tmp/arbibarbilog"

# se viene trovata un'opportunita' di arbitraggio, l'output del programma
# viene copiata in questo file (nella cartella da cui e' lanciato lo script)
SUCCESS_LOG='log_success'

# Eseguiamo lo script ad libitum
while true; do

    node doit.js | tee "$LOGFILE_TEMP"

    # se trovate opportunita' di arbitraggio, salva il log
    grep 'Arbitrage opportunity found!' $LOGFILE_TEMP && cat $LOGFILE_TEMP >> $SUCCESS_LOG

    sleep 5
done
