import Capacitor

class PrimeBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(PaceWidgetBridgePlugin())
    }
}
