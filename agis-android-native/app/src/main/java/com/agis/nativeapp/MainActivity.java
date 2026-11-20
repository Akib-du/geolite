package com.agis.nativeapp;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Typeface;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

public final class MainActivity extends Activity {
    static { System.loadLibrary("agis_gdal"); }
    private native String nativeGdalStatus();

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        TextView title = new TextView(this);
        title.setText("aGIS · Native Engine Preview");
        title.setTextSize(24);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setPadding(0, 0, 0, 18);
        TextView status = new TextView(this);
        status.setTextSize(15);
        status.setText(nativeGdalStatus());
        status.setTextIsSelectable(true);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(28, 36, 28, 28);
        content.addView(title);
        content.addView(status);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(content);
        setContentView(scroll);
    }
}
