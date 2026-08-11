# Cold Email — Template Outreach (generico)

*Fonte: `.agents/product-marketing.md` v2 (2026-08-11). Segmento target: HR/Ops Director di catene retail multi-sede, 3+ sedi, 25-200 dipendenti. Nessun prospect nominato — placeholder da compilare prima dell'invio.*

**Placeholder da compilare:**
- `{{Nome}}` — nome del destinatario
- `{{Azienda}}` — nome dell'azienda
- `{{NumeroSedi}}` — numero di sedi (se noto)
- `{{SegnaleSpecifico}}` — un segnale osservato e verificabile (es. apertura nuova sede annunciata, posizione HR/Ops aperta, articolo su espansione, post LinkedIn su un problema di gestione presenze/turni)

---

## Email 1 — Primo contatto

**Oggetto:** presenze multi-sede

**Corpo:**

```
Ciao {{Nome}},

ho visto {{SegnaleSpecifico}} — con {{NumeroSedi}} sedi immagino che
tenere sotto controllo chi timbra dove, e poter rispondere subito
a un controllo, non sia banale.

La maggior parte dei sistemi QR o GPS che ho visto in giro ha lo
stesso limite: chiunque può timbrare al posto di un collega, quindi
il dato di presenza non è mai davvero verificato.

Lavoriamo su un sistema che lega la timbratura al Face ID dello
smartphone del dipendente (zero hardware da installare), con un
log di ogni modifica pronto per un controllo.

Vale la pena approfondire?

{{TuoNome}}
```

**Note d'uso:**
- Se `{{SegnaleSpecifico}}` non è verificabile con una fonte pubblica (annuncio, LinkedIn, articolo), non inventarlo — usare invece una domanda aperta generica sul numero di sedi.
- Nessun link, nessuna richiesta di call da 30 minuti al primo contatto — l'ask è un'interest-check ("Vale la pena approfondire?"), a bassa frizione.

---

## Email 2 — Follow-up (dopo 4-5 giorni senza risposta)

**Oggetto:** un dettaglio in più

**Corpo:**

```
{{Nome}}, aggiungo solo un punto che spesso emerge parlando con chi
gestisce le presenze su più sedi: il QR o il GPS da soli non
impediscono che un collega timbri per un altro — al massimo la
timbratura risulta "fatta", ma non da chi doveva farla davvero.

Se è un tema anche per {{Azienda}}, dimmi pure — altrimenti non
insisto oltre.

{{TuoNome}}
```

**Note d'uso:**
- Angolo diverso dalla prima email (approfondisce il "perché" del problema, non ripete il pitch) — non un "volevo solo ricordarti".
- Ultimo tocco della sequenza breve: se non risponde qui, non seguono ulteriori follow-up automatici senza un nuovo segnale.

---

### Nota di onestà

Nessun proof point quantificato (risparmio tempo, % riduzione time-theft, testimonianza cliente) è incluso: Badge System non ha ancora clienti paganti (vedi `.agents/product-marketing.md`, sezione Proof Points). Il template si appoggia solo al ragionamento sul problema, non a risultati misurati — da aggiornare con dati reali dopo il primo cliente pilota.
