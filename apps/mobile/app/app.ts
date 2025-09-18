import { TouchManager, Application, CoreTypes } from '@nativescript/core'

TouchManager.enableGlobalTapAnimations = true
TouchManager.animations = {
  down: {
    scale: { x: 0.95, y: 0.95 },
    duration: 200,
    curve: CoreTypes.AnimationCurve.easeInOut,
  },
  up: {
    scale: { x: 1, y: 1 },
    duration: 200,
    curve: CoreTypes.AnimationCurve.easeInOut,
  },
}

Application.run({ moduleName: 'app-root' })

/*
Do not place any code after the application has been started as it will not
be executed on iOS.
*/
