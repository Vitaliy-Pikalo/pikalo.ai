# Local kind metrics-server

`upstream/components.yaml` is the unmodified v0.9.1 release manifest from:

[Release manifest](https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.9.1/components.yaml).

Downloaded SHA256:
`3c7f57cdbee0f57fb0259a150e8f6d6cb4f29d72d1aa5dce8803151dd6d4c2a1`.
The upstream project is licensed under Apache-2.0:
[Upstream license](https://github.com/kubernetes-sigs/metrics-server/blob/v0.9.1/LICENSE).

The Kustomize patch adds `--kubelet-insecure-tls` for this disposable local kind
cluster, whose kubelet serving certificate is not suitable for normal certificate
validation. This exception belongs only to local testing. A production cluster
should use trusted kubelet serving certificates instead. No Docker or Windows
security settings are changed.

Metrics-server 0.9.x supports Kubernetes 1.34+, including this project's 1.36.4:
[Compatibility documentation](https://github.com/kubernetes-sigs/metrics-server/blob/v0.9.1/README.md).
