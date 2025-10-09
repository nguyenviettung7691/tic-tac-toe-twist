import { Dialogs, Utils, isAndroid, isIOS } from '@nativescript/core'

declare const android: any
declare const UIApplication: any
declare const UILabel: any
declare const UIColor: any
declare const NSTextAlignmentCenter: number
declare function CGSizeMake(width: number, height: number): any
declare function CGRectMake(x: number, y: number, width: number, height: number): any
declare const UIView: any
declare const UIViewAnimationOptions: any

let alertQueue: Promise<void> = Promise.resolve()

function showAndroidToast(message: string, long = false) {
  Utils.executeOnMainThread(() => {
    const context = Utils.android.getApplicationContext()
    if (!context) {
      console.log('[notify] Unable to resolve Android context for toast.', { message })
      return
    }
    const duration = long ? android.widget.Toast.LENGTH_LONG : android.widget.Toast.LENGTH_SHORT
    android.widget.Toast.makeText(context, message, duration).show()
  })
}

function showIosToast(message: string, long = false) {
  Utils.executeOnMainThread(() => {
    const application = UIApplication.sharedApplication
    const window =
      application?.keyWindow ??
      (application?.windows && application.windows.count > 0
        ? application.windows.objectAtIndex(0)
        : null)
    if (!window) {
      console.log('[notify] Unable to resolve iOS window for toast.', { message })
      return
    }

    const toastLabel = UILabel.alloc().init()
    toastLabel.text = message
    toastLabel.textColor = UIColor.whiteColor
    toastLabel.backgroundColor = UIColor.colorWithWhiteAlpha(0, 0.85)
    toastLabel.textAlignment = NSTextAlignmentCenter
    toastLabel.numberOfLines = 0
    toastLabel.alpha = 0
    toastLabel.layer.cornerRadius = 10
    toastLabel.layer.masksToBounds = true

    const maxWidth = window.bounds.size.width - 32
    const constraintSize = CGSizeMake(maxWidth, Number.POSITIVE_INFINITY)
    const fittingSize = toastLabel.sizeThatFits(constraintSize)
    const width = Math.min(maxWidth, fittingSize.width + 24)
    const height = Math.min(window.bounds.size.height, fittingSize.height + 24)
    const originX = (window.bounds.size.width - width) / 2
    const originY = window.bounds.size.height - height - 96

    toastLabel.frame = CGRectMake(originX, originY, width, height)
    window.addSubview(toastLabel)

    UIView.animateWithDurationAnimationsCompletion(0.25, () => {
      toastLabel.alpha = 1
    }, () => {
      const duration = long ? 3.2 : 2.0
      UIView.animateWithDurationDelayOptionsAnimationsCompletion(
        0.25,
        duration,
        UIViewAnimationOptions.CurveEaseIn,
        () => {
          toastLabel.alpha = 0
        },
        () => {
          toastLabel.removeFromSuperview()
        },
      )
    })
  })
}

export function showToast(message: string, long = false) {
  if (!message) {
    return
  }
  if (isAndroid) {
    showAndroidToast(message, long)
    return
  }
  if (isIOS) {
    showIosToast(message, long)
    return
  }
  console.log('[notify]', message)
}

export function showAlert(title: string, message: string) {
  const normalizedTitle = title?.trim() || 'Notification'
  const normalizedMessage = message?.trim() || ''
  alertQueue = alertQueue.then(async () => {
    try {
      await Dialogs.alert({
        title: normalizedTitle,
        message: normalizedMessage,
        okButtonText: 'OK',
      })
    } catch (error) {
      console.error('[notify] Failed to display alert', { error })
    }
  })
  void alertQueue
}
