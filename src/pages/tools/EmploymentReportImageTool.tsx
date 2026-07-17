import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Card,
  Col,
  Empty,
  Image,
  Input,
  Row,
  Space,
  Spin,
  Statistic,
  Typography,
  message,
} from 'antd'
import {
  cleanupImageObjectUrls,
  downloadBlob,
  fetchStaticImagesFromPage,
  imagesToPdfBlob,
  toSafePdfFilename,
  type ExtractedImageItem,
} from '../../modules/employmentReport'
import { confirmToolReset } from '../../utils/toolReset'

const { Paragraph, Text } = Typography

export default function EmploymentReportImageTool() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [images, setImages] = useState<ExtractedImageItem[]>([])
  const [pageTitle, setPageTitle] = useState('')
  const fetchRequestIdRef = useRef(0)
  const fetchAbortRef = useRef<AbortController | null>(null)
  const pdfRequestIdRef = useRef(0)

  useEffect(() => {
    return () => {
      cleanupImageObjectUrls(images)
    }
  }, [images])

  useEffect(() => {
    return () => {
      fetchRequestIdRef.current += 1
      pdfRequestIdRef.current += 1
      fetchAbortRef.current?.abort()
    }
  }, [])

  const summary = useMemo(() => {
    const total = images.length
    const portrait = images.filter((img) => img.height >= img.width).length
    const landscape = images.filter((img) => img.width > img.height).length
    return { total, portrait, landscape }
  }, [images])

  const handleFetch = async () => {
    if (!url.trim()) {
      message.warning('请输入网页链接')
      return
    }

    fetchAbortRef.current?.abort()
    const requestId = fetchRequestIdRef.current + 1
    fetchRequestIdRef.current = requestId
    const controller = new AbortController()
    fetchAbortRef.current = controller

    cleanupImageObjectUrls(images)
    setImages([])
    setPageTitle('')
    setLoading(true)

    try {
      const result = await fetchStaticImagesFromPage(url.trim(), {
        signal: controller.signal,
      })
      if (fetchRequestIdRef.current !== requestId) {
        cleanupImageObjectUrls(result.images)
        return
      }
      setImages(result.images)
      setPageTitle(result.pageTitle)

      if (result.images.length) {
        message.success(`成功提取 ${result.images.length} 张图片`)
      } else {
        message.warning('未抓取到任何图片')
      }
    } catch (error) {
      if (fetchRequestIdRef.current === requestId && !controller.signal.aborted) {
        message.error(error instanceof Error ? error.message : '抓取失败')
      }
    } finally {
      if (fetchRequestIdRef.current === requestId) {
        setLoading(false)
        fetchAbortRef.current = null
      }
    }
  }

  const handleDownloadPdf = async () => {
    if (!images.length) {
      message.warning('没有可下载的图片')
      return
    }

    setPdfLoading(true)
    const requestId = pdfRequestIdRef.current + 1
    pdfRequestIdRef.current = requestId
    try {
      const blob = await imagesToPdfBlob(images)
      if (pdfRequestIdRef.current !== requestId) return
      downloadBlob(blob, toSafePdfFilename(pageTitle))
      message.success('PDF 已生成')
    } catch (error) {
      if (pdfRequestIdRef.current === requestId) {
        message.error(error instanceof Error ? error.message : 'PDF 生成失败')
      }
    } finally {
      if (pdfRequestIdRef.current === requestId) setPdfLoading(false)
    }
  }

  const handleResetPage = () => {
    confirmToolReset({
      title: '确认重置图片下载？',
      onReset: () => {
        fetchRequestIdRef.current += 1
        pdfRequestIdRef.current += 1
        fetchAbortRef.current?.abort()
        fetchAbortRef.current = null
        cleanupImageObjectUrls(images)
        setUrl('')
        setLoading(false)
        setPdfLoading(false)
        setImages([])
        setPageTitle('')
      },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="图片下载" extra={<Button danger onClick={handleResetPage}>重置</Button>}>
        <Paragraph>
          输入就业质量报告网页链接，提取静态页面中的图片，预览后合成 PDF 下载。
        </Paragraph>

        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="请输入就业质量报告网页链接"
          />

          <Space>
            <Button type="primary" loading={loading} onClick={handleFetch}>
              开始提取图片
            </Button>
            <Button
              onClick={handleDownloadPdf}
              loading={pdfLoading}
              disabled={!images.length}
            >
              下载合成 PDF
            </Button>
          </Space>

          <Text type="secondary">
            提示：浏览器环境下部分网站会因为跨域限制无法抓取；静态公开页面成功率更高。
          </Text>
        </Space>
      </Card>

      {!!images.length && (
        <Space size={16}>
          <Card>
            <Statistic title="图片总数" value={summary.total} />
          </Card>
          <Card>
            <Statistic title="竖图" value={summary.portrait} />
          </Card>
          <Card>
            <Statistic title="横图" value={summary.landscape} />
          </Card>
        </Space>
      )}

      <Card title="图片预览">
        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <Spin tip="正在抓取图片..." />
          </div>
        ) : images.length ? (
          <Row gutter={[16, 16]}>
            {images.map((img, idx) => (
              <Col key={img.id} xs={24} sm={12} md={8} lg={6}>
                <Card
                  size="small"
                  bodyStyle={{ padding: 12 }}
                  title={`图片 ${idx + 1}`}
                >
                  <Image
                    src={img.objectUrl}
                    alt={img.url}
                    style={{ width: '100%', maxHeight: 220, objectFit: 'contain' }}
                  />
                  <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.6 }}>
                    <div>
                      尺寸：{img.width} × {img.height}
                    </div>
                    <div style={{ wordBreak: 'break-all' }}>
                      来源：{img.url}
                    </div>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        ) : (
          <Empty description="输入网页链接并抓取后，这里显示图片预览" />
        )}
      </Card>
    </div>
  )
}
