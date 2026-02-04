package com.lflix.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.jeep.plugin.capacitor.capacitorvideoplayer.CapacitorVideoPlayer;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CapacitorVideoPlayer.class);
        super.onCreate(savedInstanceState);
    }
}
