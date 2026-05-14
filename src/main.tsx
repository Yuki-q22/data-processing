import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './index.css'

const themeTokens = {
  colorPrimary: '#2c5282',
  colorSuccess: '#2f855a',
  colorWarning: '#c05621',
  colorError: '#c53030',
  colorInfo: '#2c5282',
  colorTextBase: '#1a1a1a',
  colorBgBase: '#f7f5f2',
  borderRadius: 10,
  fontFamily:
    "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', sans-serif",
  fontSize: 14,
  fontSizeSM: 12,
  fontSizeLG: 16,
  controlHeight: 36,
  controlHeightSM: 28,
  controlHeightLG: 44,
  lineWidth: 1,
  lineType: 'solid',
  motion: true,
  motionDurationMid: '0.25s',
  motionDurationFast: '0.15s',
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: themeTokens,
        components: {
          Layout: {
            colorBgHeader: '#ffffff',
            colorBgBody: '#f7f5f2',
            colorBgTrigger: '#f0ece6',
          },
          Card: {
            colorBorderSecondary: '#e5e2dd',
          },
          Menu: {
            colorItemBg: 'transparent',
            colorItemBgSelected: '#e8f0f8',
            colorItemText: '#595959',
            colorItemTextSelected: '#2c5282',
            colorItemTextHover: '#1a1a1a',
            colorItemBgHover: '#faf8f5',
          },
          Steps: {
            colorPrimary: '#2c5282',
            colorText: '#595959',
            colorTextDescription: '#8c8c8c',
          },
          Table: {
            colorBgContainer: '#ffffff',
            colorBorderSecondary: '#eae7e2',
            headerBg: '#f0ece6',
            headerColor: '#595959',
          },
          Button: {
            borderRadius: 10,
            controlHeight: 36,
          },
          Input: {
            borderRadius: 10,
            controlHeight: 36,
            colorBorder: '#d6d3ce',
          },
          Select: {
            borderRadius: 10,
            controlHeight: 36,
            colorBorder: '#d6d3ce',
          },
          Alert: {
            borderRadiusLG: 10,
          },
          Modal: {
            borderRadiusLG: 20,
          },
          Tag: {
            borderRadiusSM: 6,
          },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>
)
