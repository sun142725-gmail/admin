import { onBeforeUnmount, ref } from 'vue'

/**
 * 验证码倒计时 composable
 * @param {number} seconds 倒计时秒数，默认 60
 */
export function useCountdown(seconds = 60) {
  const countdown = ref(0)
  let timer = null

  function start() {
    stop()
    countdown.value = seconds
    timer = setInterval(() => {
      countdown.value -= 1
      if (countdown.value <= 0) stop()
    }, 1000)
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    countdown.value = 0
  }

  onBeforeUnmount(stop)

  return { countdown, start, stop }
}
