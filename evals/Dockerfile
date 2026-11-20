# Build the answer image from this checkout first; reuse its production runtime.
FROM pikalo-answer-api:local
COPY --chown=node:node evals ./evals
CMD ["node", "--import", "tsx", "evals/cluster.mts"]
