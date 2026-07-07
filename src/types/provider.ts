export interface ProviderModelConfig {
  writing: string
  analysis: string
  review: string
  embedding: string
}

export interface ProviderEntry {
  name: string
  base_url: string
  api_key: string
  models: ProviderModelConfig
}

export interface ProviderConfig {
  providers: ProviderEntry[]
  active_profile: string
}
