import { ENV_KEY_REGEX } from '../../shared/constants'

export function isValidEnvKey(key: string): boolean {
  return ENV_KEY_REGEX.test(key)
}
